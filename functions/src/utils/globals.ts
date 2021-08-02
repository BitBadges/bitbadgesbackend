import { Response } from 'express';

export function errorHandler(res: Response, message: string) {
    // eslint-disable-next-line no-console
    console.log('400 ERROR: ' + message);
    return res.status(400).json(
        {
            error: message
        }
    );
}

export function successHandler(res: Response, data: any) {
    return res.status(200).json(data);
}
