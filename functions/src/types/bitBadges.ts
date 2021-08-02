export interface Badge {
    backgroundColor: string;
    dateCreated: number;
    description: string;
    externalUrl: string;
    id: string;
    imageUrl: string;
    issuer: string;
    issuerUsername: string;
    recipients: string[];
    recipientsUsernames: string[];
    title: string;
    validDateEnd: number;
    validDateStart: number;
    validDates: boolean;
    category: string;
    collectionId: string;
    isVisible: boolean;
    issuerChain: string;
    attributes: string;
    recipientsChains: string[];
}

export interface BitBadgesUserDetails {
    badgesIssued: string[];
    badgesListed: string[];
    badgesReceived: string[];
    badgesPending: string[];
    badgesAccepted: string[];
    issuedCollections: string[];
    receivedCollections: string[];
}

export interface PortfolioPage {
    title: string;
    data: Badge[];
    badges: Badge[];
    pageTitle: string;
    description: string;
    pageNum: number;
}

export interface BadgeCollection {
    backgroundColor: string;
    badges: string[];
    dateCreated: number;
    description: string;
    imageUrl: string;
    issuers: string[];
    isVisible: boolean;
    name: string;
    receivedCollection: boolean;
    recipients: string[];
}

export interface ListedBadge {
    title: string;
    issuer: string;
    preReqs: string;
    validity: string;
    description: string;
    externalUrl: string;
    imageUrl: string;
    backgroundColor: string;
    category: '';
    dateCreated: number;
    id: string;
    issuerUsername: string;
}
