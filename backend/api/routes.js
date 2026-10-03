import { Router } from "express";
import catalogRoutes from "./catalog.routes.js";
import dialogRoutes from "./dialog.routes.js";

const router = Router();

router.use(catalogRoutes);
router.use(dialogRoutes);

export default router;
