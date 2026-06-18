"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanToStroops = humanToStroops;
exports.stroopsToHuman = stroopsToHuman;
exports.buildActionRequestScVal = buildActionRequestScVal;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
function humanToStroops(amountHuman) {
    const parts = amountHuman.split('.');
    const integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    // Pad or truncate fractional part to 7 decimal places
    if (fractionalPart.length < 7) {
        fractionalPart = fractionalPart.padEnd(7, '0');
    }
    else if (fractionalPart.length > 7) {
        fractionalPart = fractionalPart.substring(0, 7);
    }
    return BigInt(integerPart + fractionalPart);
}
function stroopsToHuman(amountStroops) {
    const stroopsStr = amountStroops.toString().padStart(8, '0');
    const integerPart = stroopsStr.substring(0, stroopsStr.length - 7);
    const fractionalPart = stroopsStr.substring(stroopsStr.length - 7);
    // Trim trailing zeros in fractional part, but keep at least one zero if all are zero
    const trimmedFraction = fractionalPart.replace(/0+$/, '');
    const finalFraction = trimmedFraction.length === 0 ? '0' : trimmedFraction;
    return `${integerPart}.${finalFraction}`;
}
function buildActionRequestScVal(action, ownerAddress) {
    const stroopAmount = humanToStroops(action.amount_human);
    return (0, stellar_sdk_1.nativeToScVal)({
        owner: new stellar_sdk_1.Address(ownerAddress),
        agent: new stellar_sdk_1.Address(action.agent_address),
        destination: new stellar_sdk_1.Address(action.destination),
        asset_contract: new stellar_sdk_1.Address(action.asset_contract),
        amount: stroopAmount,
    });
}
