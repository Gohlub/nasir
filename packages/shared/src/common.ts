import { z } from "zod";

export const addressPattern = /^0x[a-fA-F0-9]{40}$/;
export const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;
export const hexPattern = /^0x[a-fA-F0-9]+$/;
export const bigintStringPattern = /^(0|[1-9]\d*)$/;

export const addressSchema = z.string().regex(addressPattern).transform((value) => value.toLowerCase());
export const bytes32Schema = z.string().regex(bytes32Pattern).transform((value) => value.toLowerCase());
export const hexSchema = z.string().regex(hexPattern).transform((value) => value.toLowerCase());
export const bigintStringSchema = z.string().regex(bigintStringPattern);
export const isoDatetimeSchema = z.string().datetime({ offset: true });
export const nullableBigintStringSchema = bigintStringSchema.nullable();
export const nullableBytes32Schema = bytes32Schema.nullable();

export function normalizeAddress(address: string): string {
  return addressSchema.parse(address);
}

export function normalizeHex(hexValue: string): string {
  return hexSchema.parse(hexValue);
}

