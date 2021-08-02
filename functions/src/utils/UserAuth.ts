
import { Request, Response, NextFunction } from 'express';
import * as jsonwebtoken from 'jsonwebtoken';
import { ec } from 'elliptic';
import { db } from './admin';
import * as bs58check from 'bs58check';
import KeyEncoder from 'key-encoder';
import { AuthenticatedRequest } from '../types/authentication';
import { errorHandler } from './globals';
import { BitBadgesUserDetails } from '../types';
const EC = new ec('secp256k1');

//Thanks to: https://github.com/mattetre/bitclout-jwt-validate
function validateJwt(bitCloutPublicKey: string, jwtToken: string) {
    const bitCloutPublicKeyDecoded = bs58check.decode(bitCloutPublicKey);
    const bitCloutPublicKeyDecodedArray = [...bitCloutPublicKeyDecoded];
    const rawPublicKeyArray = bitCloutPublicKeyDecodedArray.slice(3);
    const rawPublicKeyHex = EC.keyFromPublic(rawPublicKeyArray, 'hex').getPublic().encode('hex', true);
    const keyEncoder = new KeyEncoder('secp256k1');
    const rawPublicKeyEncoded = keyEncoder.encodePublic(rawPublicKeyHex, 'raw', 'pem');

    try {
        jsonwebtoken.verify(jwtToken, rawPublicKeyEncoded, { algorithms: ['ES256'] });
        return true;
    } catch {
        return false;
    }
}

export async function authorizeUser(expressReq: Request, res: Response, next: NextFunction) {
    const req = expressReq as AuthenticatedRequest;
    const jwt = req.body.jwt;
    const publickey = req.body.publickey;

    if (!jwt || !publickey) {
        return errorHandler(res, 'Could not obtain jwt and publickey from request.');
    }

    if (!validateJwt(publickey, jwt)) {
        return errorHandler(res, 'Invalid identification. Could not validate jwt with public key.');
    }

    req.user = {
        id: publickey
    };

    try {
        //fetch user data and make new one if doesn't exist
        const doc = await db
            .doc(`/users/${req.user.id}`)
            .get();

        const userDetails: BitBadgesUserDetails = {
            badgesIssued: [],
            badgesReceived: [],
            badgesListed: [],
            badgesAccepted: [],
            badgesPending: [],
            issuedCollections: [],
            receivedCollections: [],
        };

        if (!doc.exists) {
            await db.doc(`/users/${req.user.id}`).set(userDetails);
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

        req.userData = userDetails;
    } catch (error) {
        return errorHandler(res, `Error fetching user data from database: ${req.user.id}`);
    }

    expressReq = req;

    return next();
}
