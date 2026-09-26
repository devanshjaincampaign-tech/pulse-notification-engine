import { Router} from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { validate } from '../../common/middleware/validate.middleware.js';
import {
  postLikedEventBodySchema,
  userFollowedEventBodySchema,
} from '../event.schema.js';
import { emitPostLiked, emitUserFollowed} from './testEvent.producer.js';

const router=Router();

router.post('/post-liked', requireAuth, validate(postLikedEventBodySchema), async (req,res)=>{
    const { targetUserId, postId}=req.validated.body;

    await emitPostLiked({
        actorId: req.user.userId,
        targetUserId,
        postId,
    });


    res.status(200).json({
        message: 'Event emitted'
    });
});

router.post('/user-followed', requireAuth, validate(userFollowedEventBodySchema), async (req, res) => {
  const { targetUserId } = req.validated.body;

  await emitUserFollowed({
    actorId: req.user.userId,
    targetUserId,
  });

  res.status(200).json({ message: 'Event emitted' });
});

export default router;