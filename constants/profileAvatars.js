import { profileAvatarSources } from "../assets/images/profilelogo";

export const avatarCatalog = profileAvatarSources.map((item) => ({
  ...item,
  source: { uri: item.uri },
}));

export const defaultAvatarId = avatarCatalog[0]?.id ?? "avatar1";

const avatarSourceMap = avatarCatalog.reduce((acc, avatar) => {
  acc[avatar.id] = avatar.source;
  return acc;
}, {});

export const isValidAvatarId = (avatarId) => Boolean(avatarSourceMap[avatarId]);

export const getAvatarSource = (avatarId) => {
  if (avatarId && avatarSourceMap[avatarId]) {
    return avatarSourceMap[avatarId];
  }
  return avatarSourceMap[defaultAvatarId];
};

export const getAvatarById = (avatarId) =>
  avatarCatalog.find((item) => item.id === avatarId) || avatarCatalog[0];

