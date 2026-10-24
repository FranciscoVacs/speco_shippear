// The second door (spec 016): ideas of a company, read and written through the service as the signed-in person.
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface Question {
  id: string;
  ask: string;
  example: string;
}
export interface IdeaProgress {
  total: number;
  answered: number;
  unknown: number;
  next: string | null;
  done: boolean;
}
export interface IdeaSummary extends IdeaProgress {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
export interface Idea {
  id: string;
  title: string;
  need: string;
  lang: "es" | "en";
  questions: Question[];
  answers: Record<string, { state: "answered" | "unknown"; text: string }>;
  progress: IdeaProgress;
  brief: string;
  spec: string;
  review: { verdict: string; summary: Record<string, number> } | null;
}

export const listIdeas = (org: string) => api<IdeaSummary[]>(`/api/orgs/${org}/ideas`);
export const createIdea = (org: string, need: string, lang: "es" | "en") => api<Idea>(`/api/orgs/${org}/ideas`, { body: { need, lang } });
export const getIdea = (org: string, id: string) => api<Idea>(`/api/orgs/${org}/ideas/${id}`);
export const answerIdea = (org: string, id: string, question: string, text: string, unknown: boolean) => api<Idea>(`/api/orgs/${org}/ideas/${id}/answers`, { body: { question, text, unknown } });

/** `null` while it loads, `"error"` when the service did not answer */
export function useIdeas(org: string | null): { ideas: IdeaSummary[] | null | "error"; reload: () => void } {
  const [ideas, setIdeas] = useState<IdeaSummary[] | null | "error">(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!org) return;
    let live = true;
    listIdeas(org).then((r) => live && setIdeas(r)).catch(() => live && setIdeas("error"));
    return () => {
      live = false;
    };
  }, [org, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ideas, reload };
}
