import { db } from '../utils/admin';
import { isColor, isLengthLessThan, isNonEmptyString, isString, isURL } from '../utils/validators';
import { Request, Response } from 'express';
import { firestore } from 'firebase-admin';
import { AuthenticatedRequest } from '../types/authentication';
import { errorHandler, successHandler } from '../utils/globals';

export async function getAllBadgePages(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.params.userId;

    try {
        const badgePages: any[] = [];

        const querySnapshot = await db
            .collection('badgePages')
            .where('issuer', '==', userId)
            .get();

        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            docData.id = doc.id;
            badgePages.push(docData);
        });

        return successHandler(res, { badgePages });
    } catch (error) {
        return errorHandler(res, 'Error getting badge pages');
    }
}

export async function getBadgePage(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const badgeId = req.params.id;

    try {
        const doc = await db.doc(`/badgePages/${badgeId}`).get();

        if (!doc.exists) {
            throw "Doc doesn't exist";
        }

        return res.status(200).json(doc.data());
    } catch (error) {
        return errorHandler(res, `Error. Could not get badge page: ${badgeId}`);
    }
}

export async function deleteBadgePage(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const badgeId = req.params.id;
    const userId = req.user.id;

    try {
        await Promise.all([
            db.doc(`/badgePages/${badgeId}`).delete(),
            db.doc(`/users/${userId}`).update(
                {
                    badgesListed: firestore.FieldValue.arrayRemove(badgeId),
                }
            ),
        ]);

        return res.status(200).json({
            general: `Successfully deleted page ${badgeId}`,
        });
    } catch (error) {
        return errorHandler(res, 'Error deleting badge page: ' + badgeId);
    }
}

export async function createBadgePage(expressReq: Request, res: Response) {
    const req = expressReq as AuthenticatedRequest;
    const userId = req.user.id;
    const badgeData: any = {
        title: req.body.title,
        issuer: req.body.issuer,
        preReqs: req.body.preReqs,
        validity: req.body.validity,
        description: req.body.description,
        externalUrl: req.body.externalUrl,
        imageUrl: req.body.imageUrl ? req.body.imageUrl : 'https://images.bitclout.com/59638de19a21210d7ddd47ecec5ec041532930d5ec76b88b6ccebb14b2e6f571.webp',
        backgroundColor: req.body.backgroundColor ? req.body.backgroundColor : '#000000',
        category: '',
        dateCreated: Date.now(),
    };

    const valid =
        isNonEmptyString(badgeData.title) &&
        isNonEmptyString(badgeData.issuer) &&
        isString(badgeData.backgroundColor) &&
        isString(badgeData.preReqs) &&
        isString(badgeData.validity) &&
        isString(badgeData.description) &&
        isString(badgeData.externalUrl) &&
        isString(badgeData.imageUrl);

    if (!valid) {
        return errorHandler(res, 'Input is not formatted correctly. All must be strings, and title and issuer must non empty.');
    }

    badgeData.title = badgeData.title.trim();
    badgeData.issuer = badgeData.issuer.trim();
    badgeData.backgroundColor = badgeData.backgroundColor.trim();
    badgeData.imageUrl = badgeData.imageUrl.trim();
    badgeData.externalUrl = badgeData.externalUrl.trim();
    badgeData.description = badgeData.description.trim();
    badgeData.preReqs = badgeData.preReqs.trim();
    badgeData.validity = badgeData.validity.trim();

    if (!isLengthLessThan(badgeData.title, 80)) {
        return errorHandler(res, 'Title must be less than 80 characters');
    }

    if (badgeData.issuer !== userId) {
        return errorHandler(res, 'You can not issue in someone else\'s name. Change issuer to your public key');
    }

    if (badgeData.externalUrl.length > 0 && !isURL(badgeData.externalUrl)) {
        return errorHandler(res, 'externalUrl is not a valid URL');
    }

    if (!isColor(badgeData.backgroundColor)) {
        return errorHandler(res, 'backgroundColor is not a valid HTML ');
    }

    try {
        const doc = await db.collection('/badgePages').add(badgeData);
        const docId = doc.id;

        await Promise.all(
            [
                db.doc(`/users/${userId}`).update(
                    {
                        badgesListed: firestore.FieldValue.arrayUnion(docId),
                    }
                ),
                await db.collection('/badgePages').doc(docId).update(
                    {
                        id: docId,
                    }
                )
            ]
        );

        badgeData.id = docId;
        return successHandler(res, badgeData);
    }
    catch (error) {
        return errorHandler(res, 'Error creating badge page');
    }
}
