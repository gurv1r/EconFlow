export function getVideoLabel(video, fallbackIndex = null) {
  if (video?.displayTitle) return video.displayTitle;
  const order = Number(video?.displayOrder);
  const title = String(video?.title || "").trim();
  if (Number.isFinite(order) && order > 0) return title ? `Video ${order} - ${title}` : `Video ${order}`;
  if (fallbackIndex != null) return title ? `Video ${fallbackIndex + 1} - ${title}` : `Video ${fallbackIndex + 1}`;
  return title ? `Video - ${title}` : "Video";
}

export function getQuizBaseTitle(quiz) {
  return String(quiz?.title || "").replace(/^Quiz:\s*/i, "").trim() || "Quiz";
}

export function getQuizIndex(topic, quiz, fallbackIndex = null) {
  const index = topic?.quizzes?.findIndex((candidate) => candidate.jsonPath === quiz?.jsonPath) ?? -1;
  return index >= 0 ? index : fallbackIndex;
}

export function getQuizDuplicateIndex(topic, quiz) {
  const baseTitle = getQuizBaseTitle(quiz).toLowerCase();
  const matches = (topic?.quizzes || []).filter((candidate) => getQuizBaseTitle(candidate).toLowerCase() === baseTitle);
  if (matches.length <= 1) return null;
  const position = matches.findIndex((candidate) => candidate.jsonPath === quiz?.jsonPath);
  return position >= 0 ? { position: position + 1, total: matches.length } : null;
}

export function getQuizLabel(topic, quiz, fallbackIndex = null) {
  const index = getQuizIndex(topic, quiz, fallbackIndex);
  const prefix = index != null && index >= 0 ? `Quiz ${index + 1}` : "Quiz";
  const baseTitle = getQuizBaseTitle(quiz);
  const duplicate = getQuizDuplicateIndex(topic, quiz);
  const duplicateSuffix = duplicate ? ` (set ${duplicate.position})` : "";
  return `${prefix} - ${baseTitle}${duplicateSuffix}`;
}

export function getQuizMetricLabel(topic, quiz, fallbackIndex = null) {
  const questionLabel = `${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"}`;
  return `${getQuizLabel(topic, quiz, fallbackIndex)} | ${questionLabel}`;
}

function cleanIdentityPart(value) {
  return String(value || "").trim().toLowerCase();
}

export function getVideoIdentity(video) {
  return [
    cleanIdentityPart(video?.videoPath),
    cleanIdentityPart(video?.htmlPath),
    cleanIdentityPart(video?.path),
    cleanIdentityPart(video?.title),
    cleanIdentityPart(video?.displayTitle),
  ].filter(Boolean).join("::");
}

function hasSameVideoSource(left, right) {
  const leftVideoPath = cleanIdentityPart(left?.videoPath);
  const rightVideoPath = cleanIdentityPart(right?.videoPath);
  if (leftVideoPath && rightVideoPath && leftVideoPath === rightVideoPath) return true;

  const leftHtmlPath = cleanIdentityPart(left?.htmlPath);
  const rightHtmlPath = cleanIdentityPart(right?.htmlPath);
  if (leftHtmlPath && rightHtmlPath && leftHtmlPath === rightHtmlPath) return true;

  const leftPath = cleanIdentityPart(left?.path);
  const rightPath = cleanIdentityPart(right?.path);
  if (leftPath && rightPath && leftPath === rightPath) return true;

  return false;
}

function getVideoOrder(video, fallbackIndex) {
  const order = Number(video?.displayOrder ?? video?.order ?? video?.index);
  return Number.isFinite(order) && order > 0 ? order : fallbackIndex + 1;
}

function getOrderedTopicVideos(topic) {
  return (topic?.videos || [])
    .map((video, sourceIndex) => ({ video, sourceIndex, order: getVideoOrder(video, sourceIndex) }))
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
}

export function getTopicVideoIndex(topic, video) {
  const orderedVideos = getOrderedTopicVideos(topic);
  const targetIdentity = getVideoIdentity(video);

  let matchIndex = orderedVideos.findIndex(({ video: candidate }) => hasSameVideoSource(candidate, video));
  if (matchIndex >= 0) return matchIndex;

  matchIndex = orderedVideos.findIndex(({ video: candidate }) => getVideoIdentity(candidate) === targetIdentity);
  if (matchIndex >= 0) return matchIndex;

  const targetOrder = getVideoOrder(video, -1);
  if (targetOrder > 0) {
    matchIndex = orderedVideos.findIndex(({ order }) => order === targetOrder);
    if (matchIndex >= 0) return matchIndex;
  }

  const targetTitle = cleanIdentityPart(video?.title || video?.displayTitle);
  if (targetTitle) {
    matchIndex = orderedVideos.findIndex(({ video: candidate }) => {
      const candidateTitle = cleanIdentityPart(candidate?.title || candidate?.displayTitle);
      return candidateTitle === targetTitle;
    });
  }

  return matchIndex;
}

export function getAdjacentTopicVideos(topic, video) {
  const orderedVideos = getOrderedTopicVideos(topic);
  const index = getTopicVideoIndex(topic, video);
  if (index < 0) return { index: -1, previousVideo: null, nextVideo: null };
  return {
    index,
    previousVideo: orderedVideos[index - 1]?.video || null,
    nextVideo: orderedVideos[index + 1]?.video || null,
  };
}
