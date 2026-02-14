
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const checkPremiumStatus = (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    req.user = { isPremium: false };
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch (err) {
    req.user = { isPremium: false };
    next();
  }
};

export const requirePremium = (req: any, res: Response, next: NextFunction) => {
  if (!req.user?.isPremium) {
    return res.status(403).json({ 
      error: 'Conteúdo exclusivo para assinantes LaiLai Premium.',
      code: 'PREMIUM_REQUIRED' 
    });
  }
  next();
};
