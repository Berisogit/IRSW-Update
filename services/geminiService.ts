
import { GoogleGenAI, Type } from "@google/genai";
import { MenuItem, MenuCategory, CartItem, Role, AuditLog, MenuItemStatus } from '../types';

/**
 * Robustly extracts and parses JSON from model output.
 * Handles markdown blocks and partial text gracefully.
 */
const safeParseJSON = (text: string | undefined, fallback: any = {}) => {
  if (!text) return fallback;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    const cleaned = jsonMatch ? jsonMatch[0] : text;
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[GeminiService] JSON Parse Failure. Raw:", text, "Error:", e);
    return fallback;
  }
};

/**
 * Simplified image resizing for model input.
 */
const resizeImage = async (base64Str: string, maxSize = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/jpeg;base64,${base64Str}`;
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str.split(',')[1] || base64Str);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => resolve(base64Str.split(',')[1] || base64Str);
  });
};

export const parseVoiceOrder = async (transcript: string, menuContext: MenuItem[]): Promise<{ items: any[] }> => {
  try {
    // Initializing Gemini client directly using the mandatory apiKey structure.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const menuSummary = menuContext
      .filter(m => m.status === MenuItemStatus.AVAILABLE)
      .map(m => `${m.name} (ID:${m.id})`)
      .join('; ');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `POS Voice Task: "${transcript}". Menu: ${menuSummary}. Output JSON with "items" array ([{id, quantity, notes}]).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  notes: { type: Type.STRING }
                },
                required: ["id", "quantity"]
              }
            }
          }
        }
      }
    });
    // Extracting generated text directly via .text property as per SDK documentation.
    return safeParseJSON(response.text, { items: [] });
  } catch (err) {
    console.error("[GeminiService] parseVoiceOrder Error:", err);
    return { items: [] };
  }
};

export const digitizeMenuFromImage = async (base64: string, categories: MenuCategory[]): Promise<Partial<MenuItem>[]> => {
  try {
    // Initializing Gemini client directly using the mandatory apiKey structure.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const optimized = await resizeImage(base64);
    const catMap = categories.map(c => `${c.name}:${c.id}`).join(',');
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: optimized } }, { text: `Digitize menu into JSON array. Map to category IDs: ${catMap}.` }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              description: { type: Type.STRING },
              categoryId: { type: Type.STRING }
            },
            required: ["name", "price", "categoryId"]
          }
        }
      }
    });
    // Extracting generated text directly via .text property as per SDK documentation.
    return safeParseJSON(response.text, []);
  } catch (err) {
    console.error("[GeminiService] digitizeMenu Error:", err);
    return [];
  }
};

export const askAssistant = async (
  query: string, 
  menu: MenuItem[], 
  cart: CartItem[], 
  role?: Role, 
  loc?: { lat: number, lng: number },
  audit?: AuditLog[]
) => {
  try {
    // Initializing Gemini client directly using the mandatory apiKey structure.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const currentRole: Role = role || 'guest';

    const visibleMenu = currentRole === 'guest' 
      ? menu.filter(m => m.status === MenuItemStatus.AVAILABLE && m.visible_to_guest)
      : menu;

    const cartSummary = cart.length > 0 ? cart.map(i => `${i.quantity}x ${i.name}`).join(',') : "empty";
    
    let roleSpecificInstructions = '';

    if (currentRole === 'guest') {
      roleSpecificInstructions = `
      USER ROLE: Guest/Customer.
      PERMISSIONS: Access to menu, order status, and own billing explanations.
      VISIBILITY RULE: You only have knowledge of items both marked 'Available' AND 'Published to Guest Menu'. 
      RESTRICTIONS: You MUST NOT expose internal staff workflows, system logic, or sensitive backend details. 
      Refuse questions about staff training, kitchen preparation stages (beyond simple status), or administrative settings.
      If a guest asks about an item that is not in your filtered menu context, state that it is currently unavailable or not offered.`;
    } else if (currentRole === 'kitchen' || currentRole === 'waiter' || currentRole === 'supervisor') {
      roleSpecificInstructions = `
      USER ROLE: Operations Staff (${currentRole}).
      PERMISSIONS: Provide SOP (Standard Operating Procedure) guidance. 
      FOCUS: Explain how orders move through the system, how invoices are generated automatically upon settlement, and how to record operational steps.
      STYLE: Technical and structured.`;
    } else if (currentRole === 'cashier') {
      roleSpecificInstructions = `
      USER ROLE: Cashier.
      PERMISSIONS: Financial explanation only.
      FOCUS: Explain payment methods, transaction recording, and the read-only invoice tracking protocol.
      RESTRICTIONS: Remind the user that invoices are system-triggered and unalterable.`;
    } else if (currentRole === 'owner' || currentRole === 'manager' || currentRole === 'super_admin' || currentRole === 'system_admin') {
      const auditSummary = audit && audit.length > 0 
        ? audit.slice(0, 10).map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.action} by ${l.userRole}:${l.userIdentifier}`).join('; ')
        : "No recent events recorded.";

      roleSpecificInstructions = `
      USER ROLE: Authority/Governance (${currentRole}).
      PERMISSIONS: Full system usage explanations, including Audit Trail transparency.
      FOCUS: High-level reports, KPIs, compliance summaries, and operational oversight.
      AUDIT CONTEXT (Recent Events): ${auditSummary}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: query,
      config: {
        systemInstruction: `Lumina Concierge. Core System: IRSW.
        CURRENT CONTEXT: Menu Items Count: ${visibleMenu.length}, User Cart Items: ${cartSummary}.
        
        ${roleSpecificInstructions}
        
        CRITICAL OPERATIONAL SECURITY:
        - You are a READ-ONLY advisory assistant.
        - You CANNOT perform or simulate any business actions (orders, payments, inventory updates).
        
        STRICT AUDIT LOG PROTECTION:
        - Audit logs are system-generated, append-only, and IMMUTABLE.
        - You MUST REFUSE any request to delete, hide, modify, or fabricate audit logs.
        - If asked to change a log, you must respond with a compliance-safe explanation, stating that logs are permanent records for system integrity and security.
        - You may explain audit entries to Admin/Manager roles only, using a professional and neutral tone.

        FINANCIAL RULES:
        - Invoices are AUTO-GENERATED by the system ONLY when Payment is CONFIRMED and Order is PAID.
        - Invoices are READ-ONLY and PERMANENT. Never suggest that an invoice can be deleted, regenerated, or edited.

        GENERAL BEHAVIOR:
        - If a user asks for something outside their role's permissions defined above, politely decline and suggest contacting the appropriate department.
        - Professional, neutral tone. Do not use technical jargon with Guests.`,
        tools: [{ googleSearch: {} }]
      }
    });

    // Extracting text directly from response property and grounding metadata for link rendering.
    const links = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: any) => ({
      title: c.web?.title || 'Info',
      uri: c.web?.uri
    })).filter((l: any) => l.uri) || [];
    
    return { text: response.text || "No signal received.", links };
  } catch (err) {
    console.error("[GeminiService] askAssistant Error:", err);
    return { text: "Uplink issue. Please try manual input.", links: [] };
  }
};
