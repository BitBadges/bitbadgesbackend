import * as firebaseAdmin from 'firebase-admin';
import { firestore } from 'firebase-admin';

export const admin = firebaseAdmin.initializeApp();
export const db = admin.firestore();
export const firestoreRef = firestore;
