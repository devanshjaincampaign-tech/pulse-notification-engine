import { Router} from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { emitPostLiked, emitUserFollowed} from './testEvent.producer.js';

const router=Router();

router.post('/post-liked', requireAuth,(req,res)=>{
    const { targetUserId, postId}=req.body;

    emitPostLiked({
        actorId: req.user.userId,
        targetUserId,
        postId,
    });


    res.status(200).json({
        message: 'Event emitted'
    });
});

router.post('/user-followed', requireAuth, (req, res) => {
  const { targetUserId } = req.body;

  emitUserFollowed({
    actorId: req.user.userId,
    targetUserId,
  });

  res.status(200).json({ message: 'Event emitted' });
});

export default router;