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

export function getVideoIdentity(video) {
  return `${video?.videoPath || ""}::${video?.htmlPath || ""}::${video?.title || ""}`;
}

export function getTopicVideoIndex(topic, video) {
  const targetIdentity = getVideoIdentity(video);
  return topic?.videos?.findIndex((candidate) => getVideoIdentity(candidate) === targetIdentity) ?? -1;
}

export function getAdjacentTopicVideos(topic, video) {
  const index = getTopicVideoIndex(topic, video);
  if (index < 0) return { index: -1, previousVideo: null, nextVideo: null };
  return {
    index,
    previousVideo: topic.videos[index - 1] || null,
    nextVideo: topic.videos[index + 1] || null,
  };
}
