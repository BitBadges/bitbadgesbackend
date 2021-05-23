let db = {
  users: [
    {
      badgesReceived: [
        /* Array of badge IDs that have been issued to the user (append only, no deletion)*/
      ],
      badgesIssued: [
        /* Array of badge IDs that have been issued by the user (append only, no deletion)*/
      ],
      badgesCreated: [
        /* Badge pages that have been created by user (can be updated only by user)*/
      ],
      portfolioPages: [
        /* preferences about how to display user's profile (can only be changed by user)*/
        {
          pageTitle: "",
          pageNum: 0,
          badges: [] /*id array of badges to display on that page*/,
        },
      ],
    },
  ],
  badges: [
    {
      issuer: "",
      recipient: "",
      id: "",
      imageUrl: "",
      title: "",
      description:
        "" /* Put any instructions, text, accompanying info, links, videos, additional files, images in here. Note that " */,
      validDates: true,
      validDateStart: new Date(),
      validDateEnd: new Date(),
      dateCreated: new Date(),
      ipfsId: "",
    },
  ],
  badgePages: [
    {
      title: "",
      issuer: "",
      preReqs: "",
      validity: "",
      description: "",
      externalUrl: "",
      imageUrl: "",
    },
  ],
};
