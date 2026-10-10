/**
 * The posters the app shows, as the admin has set them.
 *
 * The home screen carried four promotional images compiled into the app, so
 * changing one meant shipping a new build to every phone. Banners have been
 * administrable for a while; nothing was reading them.
 */
import Banner from '../../models/Banner.js';

/**
 * GET /api/banners?position=homepage
 *
 * Only what is live now. The admin screen already lets a banner be scheduled,
 * but the existing reader ignored the dates, so a finished campaign kept
 * running and one queued for next week was already showing.
 */
export const getPublicBanners = async (req, res) => {
  try {
    const position = String(req.query?.position ?? 'homepage').trim();
    const now = new Date();

    const banners = await Banner.find({
      isActive: true,
      position,
      $and: [
        { $or: [{ startDate: { $lte: now } }, { startDate: null }, { startDate: { $exists: false } }] },
        { $or: [{ endDate: { $gte: now } }, { endDate: null }, { endDate: { $exists: false } }] },
      ],
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({
      status: 'success',
      data: {
        banners: banners.map((banner) => ({
          id: banner._id,
          title: banner.title,
          description: banner.description ?? null,
          imageUrl: banner.mediaUrl,
          mediaType: banner.mediaType ?? 'image',
          altText: banner.altText ?? banner.title,
          buttonText: banner.buttonText ?? null,
          /*
           * Where tapping it goes. The type says how to read the value, so
           * the app can open a restaurant or a category without guessing at
           * a URL.
           */
          actionType: banner.actionType ?? null,
          actionValue: banner.actionValue ?? null,
          actionUrl: banner.actionUrl ?? null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export default { getPublicBanners };
