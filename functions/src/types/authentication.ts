import { Request } from 'express';
import { BitBadgesUserDetails } from './bitBadges';

export interface User {
    id: string;
}

export interface AuthenticatedRequest extends Request {
    user: User;
    userData: BitBadgesUserDetails;
}
