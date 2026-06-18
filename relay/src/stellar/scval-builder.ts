import { xdr, nativeToScVal, Address } from '@stellar/stellar-sdk';

export interface AgentAction {
  agent_address: string;
  destination: string;
  asset_code: string;
  asset_issuer?: string;
  asset_contract: string;
  amount_human: string;
}

export function humanToStroops(amountHuman: string): bigint {
  const parts = amountHuman.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';
  
  // Pad or truncate fractional part to 7 decimal places
  if (fractionalPart.length < 7) {
    fractionalPart = fractionalPart.padEnd(7, '0');
  } else if (fractionalPart.length > 7) {
    fractionalPart = fractionalPart.substring(0, 7);
  }
  
  return BigInt(integerPart + fractionalPart);
}

export function stroopsToHuman(amountStroops: bigint): string {
  const stroopsStr = amountStroops.toString().padStart(8, '0');
  const integerPart = stroopsStr.substring(0, stroopsStr.length - 7);
  const fractionalPart = stroopsStr.substring(stroopsStr.length - 7);
  // Trim trailing zeros in fractional part, but keep at least one zero if all are zero
  const trimmedFraction = fractionalPart.replace(/0+$/, '');
  const finalFraction = trimmedFraction.length === 0 ? '0' : trimmedFraction;
  return `${integerPart}.${finalFraction}`;
}

export function buildActionRequestScVal(
  action: AgentAction,
  ownerAddress: string
): xdr.ScVal {
  const stroopAmount = humanToStroops(action.amount_human);

  return nativeToScVal({
    owner: new Address(ownerAddress),
    agent: new Address(action.agent_address),
    destination: new Address(action.destination),
    asset_contract: new Address(action.asset_contract),
    amount: stroopAmount,
  });
}
