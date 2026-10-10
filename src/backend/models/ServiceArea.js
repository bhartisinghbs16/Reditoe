import mongoose from 'mongoose';

/**
 * Where the platform operates at all.
 *
 * This sits above the vendor radius and answers a different question. A
 * vendor's radius is that restaurant deciding how far it will ride; this is
 * the business deciding whether it trades in a place - because a city with no
 * riders, no support cover or no licence should be closed even if a
 * restaurant there would happily deliver.
 *
 * Both have to agree before an order can be placed. The city being open does
 * not put a customer inside a particular restaurant's range, and being inside
 * that range does not help if the city is shut.
 */

const serviceAreaSchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Whether the city takes orders.
     *
     * Off is the useful state as much as on: a city can be paused for a
     * night - a festival, a flood, no riders - without deleting anything or
     * touching the vendors in it.
     */
    isActive: {
      type: Boolean,
      default: true,
    },

    /**
     * The state switch, held on every city in that state.
     *
     * Denormalised deliberately: the serviceability check runs on every
     * restaurant listing, and reading one document is better than joining to
     * a states collection each time. The admin write keeps them in step.
     */
    stateActive: {
      type: Boolean,
      default: true,
    },

    /** The centre of the city's operating area. */
    center: {
      latitude: { type: Number },
      longitude: { type: Number },
    },

    /**
     * How far from that centre the platform operates, in kilometres.
     *
     * A city is not a circle, but a circle around its centre is close enough
     * to answer "do we go there?", and it is a number an operator can reason
     * about without drawing polygons.
     */
    radiusKm: {
      type: Number,
      default: 15,
      min: 1,
      max: 100,
    },

    /**
     * The district the city sits in.
     *
     * Optional, because the platform ran on state and city alone and every
     * existing record predates this. It is here so operations can be grouped
     * the way the business actually talks about them.
     */
    district: {
      type: String,
      trim: true,
      default: '',
    },

    /**
     * Who and where the business is, in this state.
     *
     * Held on every city in the state and kept in step by the admin write,
     * for the same reason `stateActive` is: one read answers the question.
     * Blank until somebody fills it in - an invented GST number on a
     * compliance screen is worse than an empty one.
     */
    stateOffice: {
      gst: { type: String, trim: true, default: '' },
      officeAddress: { type: String, trim: true, default: '' },
      contactPerson: { type: String, trim: true, default: '' },
      contactPhone: { type: String, trim: true, default: '' },
      email: { type: String, trim: true, default: '' },
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

/** One record per city within a state. */
serviceAreaSchema.index({ state: 1, city: 1 }, { unique: true });

export default mongoose.model('ServiceArea', serviceAreaSchema);
