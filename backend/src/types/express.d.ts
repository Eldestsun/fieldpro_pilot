import "express";

declare global {
  namespace Express {
    interface User {
      oid: string;
      roles?: string[];
    }

    interface Request {
      user?: User;
    }
  }
}

export {};