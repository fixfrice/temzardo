import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { User } from '../db';
import { HttpError, auth, signToken } from '../http';

const credentials = z.object({ email: z.email().toLowerCase(), password: z.string().min(6) });
const publicUser = ({ id, email, name }: User) => ({ id, email, name });

export const authRouter = Router()
  .post('/register', async (req, res) => {
    const body = credentials.extend({ name: z.string().min(1).max(80) }).parse(req.body);
    if (await User.findOne({ where: { email: body.email } })) throw new HttpError(409, 'Email already registered');
    const user = await User.create({ ...body, passwordHash: await bcrypt.hash(body.password, 10) });
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  })
  .post('/login', async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await User.findOne({ where: { email: body.email } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    res.json({ token: signToken(user.id), user: publicUser(user) });
  })
  .get('/me', auth, async (req, res) => {
    res.json(publicUser((await User.findByPk(req.userId))!));
  });
