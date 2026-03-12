import express from "express";
import { prisma } from "../lib/prisma";

const router = express.Router();

// BAD: direct DB call in route handler
router.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

// BAD: another direct DB call
router.post("/users", async (req, res) => {
  const user = await prisma.user.create({ data: req.body });
  res.json(user);
});

export default router;
