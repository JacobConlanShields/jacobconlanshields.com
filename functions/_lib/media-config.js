export const SPINCLINE_MEDIA_BASE = "https://pub-a0784713bd834a079424dc14cf218eea.r2.dev";
export const PHOTO_MEDIA_BASE = "https://pub-980fbe5c774b4339805365b9656ec9fe.r2.dev";

const COLLECTION_CONFIG = {
  spincline_design_build: {
    r2Base: "SPINCLINE",
    prefix: "design-and-build/",
    mediaType: "image",
  },
  spincline_finished_products: {
    r2Base: "SPINCLINE",
    prefix: "finished-products/",
    mediaType: "image",
  },
  spincline_in_action: {
    r2Base: "SPINCLINE",
    prefix: "in-action/",
    mediaType: "video",
  },
  photography: {
    r2Base: "PHOTO",
    prefix: "",
    mediaType: "image",
  },
};

export const PART_SIZE = 33554432;

export function getCollectionConfig(collection) {
  return COLLECTION_CONFIG[collection] || null;
}

export function mediaBaseFor(r2Base) {
  return r2Base === "SPINCLINE" ? SPINCLINE_MEDIA_BASE : PHOTO_MEDIA_BASE;
}

export function buildPublicUrl(r2Base, r2Key) {
  return `${mediaBaseFor(r2Base)}/${r2Key}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function objectKeyFor(collection, filename) {
  const cfg = getCollectionConfig(collection);
  if (!cfg) throw new Error("Unknown collection");
  const ext = (filename?.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ext || 'bin';
  const id = crypto.randomUUID();
  return `${cfg.prefix}${id}.${safeExt}`;
}
