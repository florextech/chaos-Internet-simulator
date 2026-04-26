import fs from 'node:fs';
import path from 'node:path';

export type RecordedHttpEntry = {
  method: string;
  url: string;
  statusCode: number;
  headers: Record<string, string>;
  bodyBase64: string;
  timestamp: string;
};

type ReplayQueues = Map<string, RecordedHttpEntry[]>;

const replayKey = (method: string, url: string): string => `${method.toUpperCase()} ${url}`;

export const createRecordingManager = (recordingsDirectory: string) => {
  let recordingEnabled = false;
  let recordingFilePath: string | null = null;
  let recordedEntries: RecordedHttpEntry[] = [];

  let replayEnabled = false;
  let replayFilePath: string | null = null;
  let replayQueues: ReplayQueues = new Map();

  const startRecording = (fileName?: string): { filePath: string } => {
    fs.mkdirSync(recordingsDirectory, { recursive: true });
    const safeName = fileName?.trim() || `recording-${Date.now()}.json`;
    recordingFilePath = path.resolve(recordingsDirectory, safeName);
    recordingEnabled = true;
    recordedEntries = [];
    return { filePath: recordingFilePath };
  };

  const stopRecording = (): { filePath: string | null; entriesWritten: number } => {
    if (!recordingEnabled || !recordingFilePath) {
      return { filePath: null, entriesWritten: 0 };
    }
    fs.mkdirSync(path.dirname(recordingFilePath), { recursive: true });
    fs.writeFileSync(recordingFilePath, JSON.stringify(recordedEntries, null, 2), 'utf8');
    const result = { filePath: recordingFilePath, entriesWritten: recordedEntries.length };
    recordingEnabled = false;
    recordingFilePath = null;
    recordedEntries = [];
    return result;
  };

  const appendRecord = (entry: RecordedHttpEntry): void => {
    if (!recordingEnabled) return;
    recordedEntries.push(entry);
  };

  const startReplay = (recordingFile: string): { filePath: string; entriesLoaded: number } => {
    const resolved = path.isAbsolute(recordingFile)
      ? recordingFile
      : path.resolve(recordingsDirectory, recordingFile);
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw) as RecordedHttpEntry[];
    if (!Array.isArray(parsed)) {
      throw new Error('recording file must be an array');
    }

    replayQueues = new Map();
    for (const entry of parsed) {
      const key = replayKey(entry.method, entry.url);
      const queue = replayQueues.get(key) ?? [];
      queue.push(entry);
      replayQueues.set(key, queue);
    }

    replayEnabled = true;
    replayFilePath = resolved;
    return { filePath: resolved, entriesLoaded: parsed.length };
  };

  const stopReplay = (): { filePath: string | null } => {
    const result = { filePath: replayFilePath };
    replayEnabled = false;
    replayFilePath = null;
    replayQueues = new Map();
    return result;
  };

  const nextReplayEntry = (method: string, url: string): RecordedHttpEntry | null => {
    if (!replayEnabled) return null;
    const key = replayKey(method, url);
    const queue = replayQueues.get(key);
    if (!queue || queue.length === 0) return null;
    const entry = queue.shift() ?? null;
    return entry;
  };

  const state = () => ({
    recording: {
      enabled: recordingEnabled,
      filePath: recordingFilePath,
    },
    replay: {
      enabled: replayEnabled,
      filePath: replayFilePath,
    },
  });

  return {
    startRecording,
    stopRecording,
    appendRecord,
    startReplay,
    stopReplay,
    nextReplayEntry,
    state,
  };
};
