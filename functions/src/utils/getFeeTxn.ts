import fetch from 'node-fetch';
import { Request, Response } from 'express';
import { errorHandler, successHandler } from './globals';

export async function getFeeTransaction(req: Request, res: Response) {
    const url = 'https://bitclout.com/api/v0/send-bitclout';
    const senderPublicKey = req.params.senderKey;
    const numRecipients = Number(req.params.numRecipients);
    const nanosPerRecipient = 5000000;
    const freeTierRecipients = 25;

    if (!numRecipients || !senderPublicKey || isNaN(numRecipients) || numRecipients < 0) {
        return errorHandler(res, 'Params are invalid. numRecipients must be a valid number and senderKey must be defined');
    }

    const numPaidRecipients = numRecipients - freeTierRecipients;
    const amountNanos = numPaidRecipients < 0 ? 0 : nanosPerRecipient * numPaidRecipients;
    try {
        const response = await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                {
                    SenderPublicKeyBase58Check: senderPublicKey,
                    RecipientPublicKeyOrUsername: 'BitBadges',
                    AmountNanos: amountNanos,
                    MinFeeRateNanosPerKB: 1000,
                }
            ),
        }).then((response) => response.json());

        if (response.TransactionHex && response.SpendAmountNanos) {
            return successHandler(res, {
                TransactionHex: response.TransactionHex,
                amountNanos: response.SpendAmountNanos,
            });
        }
        else {
            return errorHandler(res, `Could not create send-bitclout transaction for ${amountNanos} nanos sending from ${senderPublicKey} to @BitBadges. This often fails when you don't have enough $CLOUT in your account.`);
        }
    } catch (error) {
        return errorHandler(res, `Could not create send-bitclout transaction for ${amountNanos} nanos sending from ${senderPublicKey} to @BitBadges. This often fails when you don't have enough $CLOUT in your account.`);
    }
}
