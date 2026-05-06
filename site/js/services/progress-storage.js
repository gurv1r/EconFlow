import { STORAGE_KEY } from "../config/constants.js";

export function createEmptyProgress() {
  return {
    version: 3,
    updatedAt: null,
    topics: {},
    videos: {},
    quizzes: {},
    flashcards: {},
    notes: {},
    noteIndex: {},
    examPapers: {},
    quizReviews: {},
    lastStudy: null,
    preferences: {
      stage: "as",
      coveredOnly: true,
      allowFuture: false,
    },
  };
}

export function loadStoredProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || createEmptyProgress();
  } catch {
    return createEmptyProgress();
  }
}

export function saveStoredProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function getProgressTimestamp(progress) {
  return Date.parse(progress?.updatedAt || "") || 0;
}

export function isProgressEmpty(progress) {
  return !Object.keys(progress?.topics || {}).length
    && !Object.keys(progress?.videos || {}).length
    && !Object.keys(progress?.quizzes || {}).length
    && !Object.keys(progress?.flashcards || {}).length
    && !Object.keys(progress?.notes || {}).length
    && !Object.keys(progress?.noteIndex || {}).length
    && !Object.keys(progress?.examPapers || {}).length
    && !Object.keys(progress?.quizReviews || {}).length
    && !progress?.lastStudy;
}
