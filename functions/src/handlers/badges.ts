/* eslint-disable no-console */
import { db, firestoreRef } from '../utils/admin';
import ipfs from 'ipfs-http-client';
import fetch from 'node-fetch';
import { Request, Response } from 'express';
import { isNonEmptyString, isString, isInteger, isBoolean, isValidStringArray, isColor, isURL, isLengthLessThan } from '../utils/validators';
import { uvarint64ToBuf } from '../utils/helpers';
import { AuthenticatedRequest } from '../types/authentication';
import { errorHandler, successHandler } from '../utils/globals';

const client = ipfs.create(
    {
        url: 'https://ipfs.infura.io:5001'
    }
);

export async function getBadges(req: Request, res: Response) {
    try {
        let badgeIds: string[] = req.body.badgeIds;
        const badges: any[] = [];

        if (!isValidStringArray(badgeIds)) {
            return successHandler(res, { badges: [] });
        }

        badgeIds = [...new Set(badgeIds)];

        await db
            .collection('badges')
            .get()
            .then((querySnapshot) => {
                querySnapshot.forEach((doc) => {
                    if (badgeIds.includes(doc.id)) {
                        badges.push(doc.data());
                    }
                });
            });

        return successHandler(res, { badges });
    } catch (error) {
        return errorHandler(res, 'Error getting badges');
    }
}

export async function getBadge(req: Request, res: Response) {
    const badgeId = req.params.id;

    try {
        const doc = await db.doc(`/badges/${badgeId}`).get();

        if (doc.exists) {
            return successHandler(res, doc.data());
        } else {
            return errorHandler(res, 'Error getting badge: ' + badgeId + '. Doc does not exist.');
        }
    } catch (error) {
        return errorHandler(res, 'Error getting badge: ' + badgeId);
    }
}

/**
 * 1) Validates all req.body info matches badge formatting standards
 * 2) Uploads to IPFS
 * 3) Gets hash of IPFS file
 * 4) Updates issuer and recipients badgesIssued and badgesReceived data in profiles
 * 5) Uploads badge to database
 * 6) Posts hash to @BitBadgesHash BitClout account
 */
export async function createBadge(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const signedTransactionHex = req.body.signedTransactionHex;
    const amountNanos = req.body.amountNanos;
    req.body.recipients = [...new Set(req.body.recipients)];
    const premiumTier = req.body.recipients.length > 25;

    const badgeData: any = {
        title: req.body.title,
        issuer: req.body.issuer,
        issuerChain: '$CLOUT',
        recipients: req.body.recipients,
        description: req.body.description,
        imageUrl: req.body.imageUrl ? req.body.imageUrl : 'https://images.bitclout.com/59638de19a21210d7ddd47ecec5ec041532930d5ec76b88b6ccebb14b2e6f571.webp',
        validDates: req.body.validDates,
        validDateStart: req.body.validDateStart,
        validDateEnd: req.body.validDateEnd,
        backgroundColor: req.body.backgroundColor ? req.body.backgroundColor : '#000000',
        externalUrl: req.body.externalUrl,
        dateCreated: Date.now(),
        isVisible: true,
        attributes: '{}',
    };

    const valid =
        isNonEmptyString(badgeData.title) &&
        isNonEmptyString(badgeData.issuer) &&
        isValidStringArray(badgeData.recipients) &&
        isString(badgeData.backgroundColor) &&
        isString(badgeData.description) &&
        isString(badgeData.externalUrl) &&
        isString(badgeData.imageUrl);

    if (!valid) {
        return errorHandler(res, 'String inputs are not formatted correctly. Title and issuer are required not to be empty and all else must be valid strings. Background color must be a valid HTML color property. URLs must be in a valid URL format',);
    }

    badgeData.title = badgeData.title.trim();
    badgeData.issuer = badgeData.issuer.trim();
    badgeData.backgroundColor = badgeData.backgroundColor.trim();
    badgeData.imageUrl = badgeData.imageUrl.trim();
    badgeData.externalUrl = badgeData.externalUrl.trim();
    badgeData.description = badgeData.description.trim();

    if (!isLengthLessThan(badgeData.title, 80)) {
        return errorHandler(res, 'Title must be less than 80 characters');
    }

    if (badgeData.recipients.length <= 0) {
        return errorHandler(res, 'Must be at least one recipient.');
    }

    if (badgeData.externalUrl.length > 0 && !isURL(badgeData.externalUrl)) {
        return errorHandler(res, 'externalUrl is not a valid URL');
    }

    if (!isColor(badgeData.backgroundColor)) {
        return errorHandler(res, 'backgroundColor is not a valid HTML color name');
    }

    const recipientsChains: string[] = [];
    badgeData.recipients.forEach(() => {
        recipientsChains.push('$CLOUT');
    });
    badgeData.recipientsChains = recipientsChains;

    if (req.user.id !== badgeData.issuer) {
        return errorHandler(res, 'You can not issue in someone else\'s name. Change issuer to your public key');
    }

    if (!isBoolean(badgeData.validDates)) {
        return errorHandler(res, 'validDates must be a boolean');
    }

    if (badgeData.validDates) {
        if (!isInteger(badgeData.validDateStart) || !isInteger(badgeData.validDateEnd)) {
            return errorHandler(res, 'validDateStart and validDateEnd must be an integer representing the number of milliseconds since 1/1/1970 00:00:00 UTC');
        }

        if (badgeData.validDateStart >= badgeData.validDateEnd) {
            return errorHandler(res, 'validDateStart must be less than validDateEnd');
        }
    } else {
        badgeData.validDateEnd = 8640000000000000;
        badgeData.validDateStart = Date.now();
    }

    //if over 25 recipients, make sure payment goes through
    if (premiumTier) {
        const url = 'https://bitclout.com/api/v0/submit-transaction';
        if (!signedTransactionHex || !amountNanos) {
            return errorHandler(res, 'Please specify signedTransactionHex and amountNanos. You have over 25 recipients');
        }

        const ratePerRecipient = 5000000;
        const numRecipients = req.body.recipients.length - 25;
        const minPrice = numRecipients * ratePerRecipient;
        const hexLen = signedTransactionHex.length;
        const inputTxnHex = '0x' + signedTransactionHex.substring(0, 2);
        const inputTxnLen = parseInt(inputTxnHex, 16);
        const outputTxnLenIdx = 2 + 66 * inputTxnLen;
        const recipientPublicKeyIdx = outputTxnLenIdx + 2;
        const recipientAmountNanosIdx = recipientPublicKeyIdx + 66;
        const nanoBytes = uvarint64ToBuf(amountNanos).toString('hex');
        const recipientPublicKey = signedTransactionHex.substring(recipientPublicKeyIdx, recipientPublicKeyIdx + 66);

        if (amountNanos < minPrice) {
            return errorHandler(res, `amountNanos is not enough. Must be at least ${minPrice} for ${numRecipients} recipients`);
        }

        if (hexLen <= 2) {
            return errorHandler(res, 'Invalid signed transaction hex. Not long enough to be valid');
        }

        if (isNaN(inputTxnLen)) {
            return errorHandler(res, 'Invalid transaction hex: InputTxnLen is not a number');
        }

        if (nanoBytes.length + recipientAmountNanosIdx > hexLen) {
            return errorHandler(res, 'Invalid signed transaction hex. Not long enough to be valid');
        }

        if (recipientPublicKey != '02b6e2717127e11282ccdee91e176381a25f1114f2e21d994e14beda538e303698') {
            return errorHandler(res, 'Invalid recipient: recipient of transaction must be @BitBadges account');
        }

        if (!signedTransactionHex.substring(recipientAmountNanosIdx).startsWith(nanoBytes)) {
            return errorHandler(res, 'Invalid signed transaction hex: amountNanos does not match');
        }

        try {
            const response = await fetch(url, {
                method: 'post',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ TransactionHex: signedTransactionHex }),
            }).then(response => response.json());

            if (response.error) {
                throw 'Payment transaction failed';
            }
        } catch (error) {
            return errorHandler(res, 'Error sending $CLOUT to @BitBadges');
        }
    }

    let ipfsHash: string;
    try {
        const { cid } = await client.add(JSON.stringify(badgeData));
        ipfsHash = cid.toString();
        badgeData.id = ipfsHash;
    } catch (error) {
        if (premiumTier) {
            const errorMessage = 'IMPORTANT: Your payment has gone through but we were unable to upload to IPFS. Contact @BitBadges for a refund.';
            console.error(new Error(errorMessage));
            return res.status(500).json({ 'error': errorMessage });
        } else {
            return errorHandler(res, 'Error uploading badgeData to IPFS');
        }
    }

    try {
        const recipients: string[] = badgeData.recipients;
        const requests = [];
        for (const recipient of recipients) {
            requests.push(db.doc(`/users/${recipient}`).get());
        }

        const responses = await Promise.all(requests);

        const updateRequests = [];
        for (const doc of responses) {
            if (doc.exists) {
                updateRequests.push(db.doc(`/users/${doc.id}`).update(
                    {
                        badgesReceived: firestoreRef.FieldValue.arrayUnion(ipfsHash),
                        badgesPending: firestoreRef.FieldValue.arrayUnion(ipfsHash),
                    }
                ));
            } else {
                updateRequests.push(db.doc(`/users/${doc.id}`).set({
                    badgesIssued: [],
                    badgesReceived: [ipfsHash],
                    badgesListed: [],
                    badgesPending: [ipfsHash],
                    badgesAccepted: [],
                    issuedCollections: [],
                    receivedCollections: []
                }));
            }
        }

        updateRequests.push(db.doc(`/users/${userId}`).update(
            {
                badgesIssued: firestoreRef.FieldValue.arrayUnion(ipfsHash),
            }
        ));

        await Promise.all(updateRequests);
    } catch (error) {
        const errorMessage = 'IMPORTANT: Error while updating recipient/issuer data in database. Your details may have been changed in our database but badge has not been finalized yet. Please reach out to @BitBadges to reverse this.';
        const issuer: string = badgeData.issuer;
        const recipients: string[] = badgeData.recipients;
        console.error(new Error(`${errorMessage} --- badgeId: ${ipfsHash} --- issuer: ${issuer} --- recipients: ${recipients.toString()}`));
        return errorHandler(res, errorMessage);
    }

    try {
        await db.collection('/badges').doc(ipfsHash).set(badgeData);
    } catch (error) {
        const errorMessage = 'IMPORTANT: Failed to upload badge to database. All issuer/recipient details may have been changed in our database but badge has not been finalized yet. Please reach out to @BitBadges to reverse this.';
        const issuer: string = badgeData.issuer;
        const recipients: string[] = badgeData.recipients;
        console.error(new Error(`${errorMessage} --- badgeId: ${ipfsHash} --- issuer: ${issuer} --- recipients: ${recipients.toString()}`));
        return errorHandler(res, errorMessage);
    }

    try {
        let url = 'https://bitclout.com/api/v0/submit-post';

        const response = await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                UpdaterPublicKeyBase58Check: 'BC1YLgvPruTYF3R66H96g1nCq9jhewpH7k8iwjQr7WoLacby8tNZNan',
                PostHashHexToModify: '',
                ParentStakeID: '',
                Title: '',
                BodyObj: {
                    Body: ipfsHash,
                    ImageURLs: [],
                },
                RecloutedPostHashHex: '',
                PostExtraData: {},
                Sub: '',
                IsHidden: false,
                MinFeeRateNanosPerKB: 1000,
            }),
        }).then(response => response.json());

        const transactionHex = response.TransactionHex;

        url = 'https://us-central1-bitbadgespostbot.cloudfunctions.net/api/sign';

        const signedResponse = await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactionHex }),
        }).then(response => response.json());

        const signedHex = signedResponse.signedHex;

        url = 'https://bitclout.com/api/v0/submit-transaction';

        await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TransactionHex: signedHex }),
        });
    } catch (error) {
        const errorMessage = 'IMPORTANT: Could not submit badge hash to @BitBadgesHash. All details on IPFS and our database have been successfully updated. Please reach out to @BitBadges to reverse this.';
        const issuer: string = badgeData.issuer;
        const recipients: string[] = badgeData.recipients;
        console.error(new Error(`${errorMessage} --- badgeId: ${ipfsHash} --- issuer: ${issuer} --- recipients: ${recipients.toString()}`));
        return errorHandler(res, errorMessage);
    }

    return successHandler(res, badgeData);
}
