import { profileAvatarSources } from "../assets/images/profilelogo";

export const presetAvatars = profileAvatarSources.map((item) => ({
  ...item,
  source: { uri: item.uri },
}));

export const defaultAvatarId = presetAvatars[0]?.id ?? "avatar1";

const avatarSourceMap = presetAvatars.reduce((acc, avatar) => {
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
