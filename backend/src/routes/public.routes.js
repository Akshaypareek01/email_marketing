import { Router } from 'express';
import { unsubscribe, unsubscribeStatus } from '../controllers/public.controller.js';

const router = Router();

router.get('/unsubscribe/status', unsubscribeStatus);
router.post('/unsubscribe', unsubscribe);

export default router;
