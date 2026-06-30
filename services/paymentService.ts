/**
 * Mock Service for Telebirr Payment Integration
 */

export const initiateTelebirrPayment = async (phoneNumber: string, amount: number): Promise<{ success: boolean; transactionId?: string; message: string }> => {
    // Simulate API Latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Basic validation
    if (!phoneNumber || phoneNumber.length < 9) {
        return { success: false, message: "Invalid phone number format." };
    }

    console.log(`[Telebirr Mock] Payment Request sent to ${phoneNumber} for ETB ${amount}`);

    // Simulate the "Waiting for Customer Confirmation" phase
    // In a real app, this would be a polling mechanism or a websocket waiting for a callback
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Simulate random success/failure (95% success rate for demo)
    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
        return {
            success: true,
            transactionId: `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            message: "Payment confirmed successfully."
        };
    } else {
        return {
            success: false,
            message: "Customer declined payment or timeout."
        };
    }
};