import { UnitOfMeasure, UNIT_CONVERSIONS } from '../types/firestoreSchema';

export class UnitConversionService {
  static canConvert(fromUnit: string, toUnit: string): boolean {
    if (fromUnit === toUnit) return true;
    return UNIT_CONVERSIONS.some(
      (rule) => rule.from === fromUnit && rule.to === toUnit
    );
  }

  static convertQuantity(value: number, fromUnit: string, toUnit: string): number {
    if (fromUnit === toUnit) return value;

    const rule = UNIT_CONVERSIONS.find(
      (r) => r.from === fromUnit && r.to === toUnit
    );

    if (!rule) {
      throw new Error(`Conversion from ${fromUnit} to ${toUnit} is not supported.`);
    }

    return value * rule.factor;
  }

  static normalizeWeight(value: number, fromUnit: string): number {
    return this.convertQuantity(value, fromUnit, 'kg');
  }

  static normalizeVolume(value: number, fromUnit: string): number {
    return this.convertQuantity(value, fromUnit, 'litre');
  }

  static normalizeQuantity(value: number, fromUnit: string): number {
    if (['kg', 'g'].includes(fromUnit)) {
      return this.normalizeWeight(value, fromUnit);
    }
    if (['litre', 'ml'].includes(fromUnit)) {
      return this.normalizeVolume(value, fromUnit);
    }
    if (fromUnit === 'piece') {
      return value;
    }
    throw new Error(`Normalization for unit ${fromUnit} is not supported.`);
  }

  static normalizeRecipeIngredient(
    inventoryItemId: string,
    quantity: number,
    unitOfMeasure: string
  ): { inventoryItemId: string; normalizedQuantity: number; normalizedUnit: UnitOfMeasure } {
    let normalizedUnit: UnitOfMeasure;
    if (['kg', 'g'].includes(unitOfMeasure)) {
      normalizedUnit = 'kg';
    } else if (['litre', 'ml'].includes(unitOfMeasure)) {
      normalizedUnit = 'litre';
    } else if (unitOfMeasure === 'piece') {
      normalizedUnit = 'piece';
    } else {
      throw new Error(`Explicit conversion failure: Unsupported unit of measure ${unitOfMeasure}`);
    }

    const normalizedQuantity = this.convertQuantity(quantity, unitOfMeasure, normalizedUnit);

    return {
      inventoryItemId,
      normalizedQuantity,
      normalizedUnit
    };
  }
}
