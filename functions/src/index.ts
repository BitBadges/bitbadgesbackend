/* eslint-disable @typescript-eslint/no-misused-promises */

import * as functions from 'firebase-functions';
import express from 'express';
import { authorizeUser } from './utils/UserAuth';
import { getFeeTransaction } from './utils/getFeeTxn';
import { getBadge, getBadges, createBadge } from './handlers/badges';
import cors from 'cors';
import {
    getUserInfo,
    getUsername,
    getPublicKey,
    getHodlers,
    acceptBadge,
    declineBadge,
    removeAcceptedBadge,
    removeIssuedBadge,
} from './handlers/users';

import {
    createCollection,
    deleteCollection,
    getCollection,
    addToCollection,
    removeFromCollection,
    getAllUserCollections,
} from './handlers/collections';

import {
    getAllBadgePages,
    getBadgePage,
    createBadgePage,
    deleteBadgePage,
} from './handlers/badgePages';

const app = express();
app.use(cors());

//users.ts
app.get('/users/:id', getUserInfo);
app.post('/acceptBadge', authorizeUser, acceptBadge);
app.post('/declineBadge', authorizeUser, declineBadge);
app.post('/hideAcceptedBadge', authorizeUser, removeAcceptedBadge);
app.post('/hideIssuedBadge', authorizeUser, removeIssuedBadge);

app.get('/username/:publicKey', getUsername);
app.get('/publicKey/:userName', getPublicKey);
app.post('/hodlers', getHodlers);

//badges.ts
app.post('/badge', authorizeUser, createBadge);
app.get('/badge/:id', getBadge);
app.post('/badges', getBadges);
app.get('/feeTxn/:senderKey/:numRecipients', getFeeTransaction);

//badgePages.ts
app.get('/badgePages/:id', getBadgePage);
app.get('/userBadgePages/:userId', getAllBadgePages);
app.post('/badgePages', authorizeUser, createBadgePage);
app.post('/badgePages/:id', authorizeUser, deleteBadgePage);

//collections.ts
app.post('/createCollection', authorizeUser, createCollection);
app.post('/deleteCollection', authorizeUser, deleteCollection);
app.get('/collections/:userId/:name', getCollection);
app.get('/collections/:userId', getAllUserCollections);
app.post('/addToCollection', authorizeUser, addToCollection);
app.post('/removeFromCollection', authorizeUser, removeFromCollection);

exports.api = functions.https.onRequest(app);
