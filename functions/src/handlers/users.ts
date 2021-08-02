import { db, firestoreRef } from '../utils/admin';
import { isNonEmptyString } from '../utils/validators';
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import { AuthenticatedRequest } from '../types/authentication';
import { errorHandler, successHandler } from '../utils/globals';
import { BitBadgesUserDetails } from '../types';

export async function getPublicKey(req: Request, res: Response) {
    const userName = req.params.userName;
    const url = 'https://bitclout.com/api/v0/get-single-profile';

    try {
        const resData = await fetch(url,
            {
                method: 'post',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Username: userName }),
            }
        ).then((response: any) => response.json());

        return successHandler(res, resData);
    } catch (error) {
        return errorHandler(res, 'Could not obtain public key for user: ' + userName);
    }
}

export async function getHodlers(req: Request, res: Response) {
    const url = 'https://bitclout.com/api/v0/get-hodlers-for-public-key';

    try {
        const resData = await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                {
                    Username: req.body.Username,
                    NumToFetch: req.body.NumToFetch,
                }
            ),
        }).then((response) => response.json());

        return successHandler(res, resData);
    } catch (error) {
        return errorHandler(res, 'Could not fetch hodlers');
    }
}

export async function getUsername(req: Request, res: Response) {
    const publicKey = req.params.publicKey;
    const url = 'https://bitclout.com/api/v0/get-single-profile';

    try {
        const resData = await fetch(url, {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                {
                    PublicKeyBase58Check: publicKey
                }
            ),
        }).then((response) => response.json());

        return successHandler(res, resData);
    } catch (error) {
        return errorHandler(res, 'Could not get username for public key: ' + publicKey);
    }
}

export async function getUserInfo(req: Request, res: Response) {
    const userId = req.params.id;

    try {
        const userDetails: BitBadgesUserDetails = {
            badgesIssued: [],
            badgesReceived: [],
            badgesListed: [],
            badgesAccepted: [],
            badgesPending: [],
            issuedCollections: [],
            receivedCollections: [],
        };

        const doc = await db.doc(`/users/${userId}`).get();

        if (!doc.exists) {
            await db.doc(`/users/${userId}`).set(userDetails);
        }
        else {
            const docData = doc.data();
            if (docData) {
                userDetails.badgesAccepted = docData.badgesAccepted;
                userDetails.badgesIssued = docData.badgesIssued;
                userDetails.badgesListed = docData.badgesListed;
                userDetails.badgesReceived = docData.badgesReceived;
                userDetails.badgesPending = docData.badgesPending;
                userDetails.issuedCollections = docData.issuedCollections;
                userDetails.receivedCollections = docData.receivedCollections;
            }
        }

        return successHandler(res, userDetails);
    } catch (error) {
        return errorHandler(res, 'Could not fetch user details for user: ' + userId);
    }
}

export async function acceptBadge(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badgeId: string = req.body.badgeId;

    if (!isNonEmptyString(badgeId)) {
        return errorHandler(res, 'Please enter a valid string for the badgeId');
    }

    try {
        if (req.userData.badgesPending.includes(badgeId)) {
            await db.doc(`/users/${userId}`).update({
                badgesPending: firestoreRef.FieldValue.arrayRemove(badgeId),
                badgesAccepted: firestoreRef.FieldValue.arrayUnion(badgeId),
            });

            await db.doc(`/badges/${badgeId}`).update(
                {
                    dateAccepted: Date.now()
                }
            );

            return successHandler(res, { general: 'Successfully accepted badge' });
        } else {
            return errorHandler(res, `${badgeId} not in pending array`);
        }
    } catch (error) {
        return errorHandler(res, 'Error accepting badge: ' + badgeId);
    }
}

export async function declineBadge(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badgeId: string = req.body.badgeId;

    if (!isNonEmptyString(badgeId)) {
        return errorHandler(res, 'Please enter a valid string for badgeId');
    }

    try {
        if (req.userData.badgesPending.includes(badgeId)) {
            await db.doc(`/users/${userId}`).update({
                badgesPending: firestoreRef.FieldValue.arrayRemove(badgeId)
            });

            return successHandler(res, { general: 'Successfully declined badge' });
        } else {
            return errorHandler(res, `${badgeId} not in pending array`);
        }
    } catch (error) {
        return errorHandler(res, 'Error declining badge: ' + badgeId);
    }
}

export async function removeAcceptedBadge(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badgeId: string = req.body.badgeId;

    if (!isNonEmptyString(badgeId)) {
        return errorHandler(res, 'Please enter a valid string for badgeId');
    }

    try {
        if (req.userData.badgesAccepted.includes(badgeId)) {
            await db.doc(`/users/${userId}`).update({
                badgesAccepted: firestoreRef.FieldValue.arrayRemove(badgeId)
            });

            await db.doc(`/badges/${badgeId}`).update(
                {
                    dateAccepted: firestoreRef.FieldValue.delete()
                }
            );

            return successHandler(res, { general: 'Successfully removed badge' });
        } else {
            return errorHandler(res, `${badgeId} not in pending array`);
        }
    } catch (error) {
        return errorHandler(res, 'Error removing badge: ' + badgeId);
    }
}

/**
 * Removes a badge from your badgesIssued and adds it to badgesRemovedFromIssued
 */
export async function removeIssuedBadge(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badgeId: string = req.body.badgeId;

    if (!isNonEmptyString(badgeId)) {
        return errorHandler(res, 'Please enter a valid string to badgeId');
    }

    try {
        if (req.userData.badgesIssued.includes(badgeId)) {
            await db.doc(`/users/${userId}`).update({
                badgesIssued: firestoreRef.FieldValue.arrayRemove(badgeId),
                badgesRemovedFromIssued: firestoreRef.FieldValue.arrayUnion(badgeId),
            });

            return successHandler(res, { general: 'Successfully removed badge' });
        } else {
            return errorHandler(res, `${badgeId} not in pending array`);
        }
    } catch (error) {
        return errorHandler(res, 'Error removing badge: ' + badgeId);
    }
}
