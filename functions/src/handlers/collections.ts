import { firestore } from 'firebase-admin';
import { db } from '../utils/admin';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/authentication';
import {
    isURL,
    isColor,
    isString,
    isBoolean,
    isNonEmptyString,
    isValidStringArray,
    isLengthLessThan,
} from '../utils/validators';
import { BadgeCollection } from '../types';
import { errorHandler, successHandler } from '../utils/globals';

export async function createCollection(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;

    const collection: BadgeCollection = {
        name: req.body.name,
        receivedCollection: req.body.receivedCollection,
        description: req.body.description,
        imageUrl: req.body.imageUrl ? req.body.imageUrl
            : 'https://images.bitclout.com/59638de19a21210d7ddd47ecec5ec041532930d5ec76b88b6ccebb14b2e6f571.webp',
        backgroundColor: req.body.backgroundColor ? req.body.backgroundColor : '#000000',
        badges: req.body.badges,
        isVisible: true,
        dateCreated: Date.now(),
        issuers: [],
        recipients: []
    };

    if (!isNonEmptyString(collection.name)) {
        return errorHandler(res, 'Please enter a valid string for collection name');
    }

    const maxLength = 80;
    if (!isLengthLessThan(collection.name, maxLength)) {
        return errorHandler(res, `Collection name must be less than ${maxLength} characters`);
    }

    if (!isString(collection.description)) {
        return errorHandler(res, 'Please enter a valid string for description');
    }

    if (!isNonEmptyString(collection.imageUrl) || !isURL(collection.imageUrl)) {
        return errorHandler(res, 'Please enter a valid URL for the image URL');
    }

    if (!isNonEmptyString(collection.backgroundColor) || !isColor(collection.backgroundColor)) {
        return errorHandler(res, 'Please enter a valid HTML color name for background color');
    }

    if (!isBoolean(collection.receivedCollection)) {
        return errorHandler(res, 'Please enter a boolean for receivedCollection');
    }

    if (!isBoolean(collection.isVisible)) {
        return errorHandler(res, 'Please enter a boolean for isVisible');
    }

    if (collection.receivedCollection) {
        for (const badgeId of collection.badges) {
            if (!req.userData.badgesReceived.includes(badgeId)) {
                return errorHandler(res, badgeId + ' does not exist in your received badges.');
            }
        }
    } else {
        for (const badgeId of collection.badges) {
            if (!req.userData.badgesIssued.includes(badgeId)) {
                return errorHandler(res, badgeId + ' does not exist in your issued badges.');
            }
        }
    }

    for (const name of req.userData.issuedCollections) {
        if (collection.name === name) {
            return errorHandler(res, 'Collection with same name already exists.');
        }
    }

    for (const name of req.userData.receivedCollections) {
        if (collection.name === name) {
            return errorHandler(res, 'Collection with same name already exists.');
        }
    }

    try {
        const allRecipients: any[] = [];
        const allIssuers: any[] = [];
        const requests = [];

        for (const badgeId of collection.badges) {
            requests.push(db.doc(`/badges/${badgeId}`).get());
        }

        const responses = await Promise.all(requests);

        for (const doc of responses) {
            if (doc.exists) {
                const docData = doc.data();
                if (docData) {
                    allRecipients.push(...docData.recipients);
                    allIssuers.push(docData.issuer);
                }
            }
        }

        collection.issuers = [...new Set(allIssuers)];
        collection.recipients = [...new Set(allRecipients)];

        await Promise.all(
            [
                db.doc(`/users/${userId}`).collection('collections').doc(collection.name).set(collection),
                collection.receivedCollection ?
                    db.doc(`/users/${userId}`).update({ receivedCollections: firestore.FieldValue.arrayUnion(collection.name) }) :
                    db.doc(`/users/${userId}`).update({ issuedCollections: firestore.FieldValue.arrayUnion(collection.name) })
            ]
        );

        return successHandler(res, collection);
    }
    catch (error) {
        return errorHandler(res, 'Error creating collection: ' + collection.name);
    }
}

export async function deleteCollection(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const name: string = req.body.name;

    try {
        await db
            .doc(`/users/${userId}`)
            .collection('collections')
            .doc(name)
            .delete();

        await db.doc(`/users/${userId}`).update({
            receivedCollections: firestore.FieldValue.arrayRemove(name),
            issuedCollections: firestore.FieldValue.arrayRemove(name),
        });

        return successHandler(res, { general: 'Succefully deleted collection. ' });
    } catch (error) {
        return errorHandler(res, 'Error deleting collection: ' + name);
    }
}

export async function getCollection(req: Request, res: Response) {
    const userId = req.params.userId;
    const name = req.params.name;

    try {
        const doc = await db
            .doc(`/users/${userId}`)
            .collection('collections')
            .doc(name)
            .get();

        if (doc.exists) {
            return successHandler(res, doc.data());
        } else {
            return errorHandler(res, 'Error getting collection: ' + name);
        }
    } catch (error) {
        return errorHandler(res, 'Error getting collection: ' + name);
    }
}

export async function getAllUserCollections(req: Request, res: Response) {
    const userId = req.params.userId;

    try {
        const collections: any[] = [];

        await db
            .doc(`/users/${userId}`)
            .collection('collections')
            .get()
            .then((querySnapshot) => {
                querySnapshot.forEach((elem) => {
                    collections.push(elem.data());
                });
            });

        return successHandler(res, { collections });
    } catch (error) {
        return errorHandler(res, 'Error getting collections for user: ' + userId);
    }
}

export async function addToCollection(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badges: string[] = req.body.badges;
    const name = req.body.name;

    if (!isValidStringArray(req.body.badges)) {
        return errorHandler(res, 'Badge array is not a valid string array.');
    }

    if (req.body.badges.length == 0) {
        return successHandler(res, { general: 'No badges specified in badges array.' });
    }

    if (!isNonEmptyString(req.body.name)) {
        return errorHandler(res, 'name must be a non empty string');
    }

    if (req.userData.issuedCollections.includes(name)) {
        for (const badgeId of badges) {
            if (!req.userData.badgesIssued.includes(badgeId)) {
                return errorHandler(res, badgeId + ' does not exist in your issued badges.');
            }
        }
    } else if (req.userData.receivedCollections.includes(name)) {
        for (const badgeId of badges) {
            if (!req.userData.badgesReceived.includes(badgeId)) {
                return errorHandler(res, badgeId + ' does not exist in your received badges.');
            }
        }
    } else {
        return errorHandler(res, 'Collection ' + name + ' does not exist');
    }

    try {
        const requests = [];

        let allRecipients: string[] = [];
        let allIssuers: string[] = [];

        for (const badgeId of badges) {
            requests.push(db.doc(`/badges/${badgeId}`).get());
        }

        const responses = await Promise.all(requests);

        for (const doc of responses) {
            if (doc.exists) {
                const docData = doc.data();
                if (docData) {
                    allRecipients.push(...docData.recipients);
                    allIssuers.push(docData.issuer);
                }
            }
        }

        allIssuers = [...new Set(allIssuers)];
        allRecipients = [...new Set(allRecipients)];

        await db
            .doc(`/users/${userId}`)
            .collection('collections')
            .doc(name)
            .update({
                issuers: firestore.FieldValue.arrayUnion(...allIssuers),
                recipients: firestore.FieldValue.arrayUnion(...allRecipients),
                badges: firestore.FieldValue.arrayUnion(...badges),
            });

        return successHandler(res, { general: 'Successfuly updated collection: ' + name });
    } catch (error) {
        return errorHandler(res, 'Error updating collection: ' + name);
    }
}

export async function removeFromCollection(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badges = req.body.badges;
    const name = req.body.name;

    if (!isValidStringArray(req.body.badges)) {
        return res.status(400).json({
            general: 'Badge array is not a valid string array',
        });
    }

    if (req.body.badges.length == 0) {
        return successHandler(res, { general: 'No badges specified in badges array.' });
    }

    try {
        const doc = await db.doc(`/users/${userId}`).collection('collections').doc(name).get();

        let collectionData: any = {};
        if (doc.exists) {
            collectionData = doc.data();
        } else {
            return errorHandler(res, 'Collection with ' + name + ' does not exist');
        }

        const newBadgeArr: string[] = [];
        for (const badge of collectionData.badges) {
            if (!badges.includes(badge)) {
                newBadgeArr.push(badge);
            }
        }

        let allRecipients: string[] = [];
        let allIssuers: string[] = [];
        const requests = [];

        for (const badgeId of newBadgeArr) {
            requests.push(db.doc(`/badges/${badgeId}`).get());
        }

        const responses = await Promise.all(requests);

        for (const doc of responses) {
            if (doc.exists) {
                const docData = doc.data();
                if (docData) {
                    allRecipients.push(...docData.recipients);
                    allIssuers.push(docData.issuer);
                }
            }
        }

        allIssuers = [...new Set(allIssuers)];
        allRecipients = [...new Set(allRecipients)];

        await db
            .doc(`/users/${userId}`)
            .collection('collections')
            .doc(name)
            .update({
                issuers: allIssuers,
                recipients: allRecipients,
                badges: newBadgeArr,
            });

        return successHandler(res, { general: 'Successfully updated collection: ' + name });
    } catch (error) {
        return errorHandler(res, 'Error removing from collection: ' + name);
    }
}
