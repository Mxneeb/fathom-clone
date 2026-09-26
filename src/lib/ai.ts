import Groq from "groq-sdk";

// Real Groq-backed generation for the two priority-#2/#3 features: AI
// summaries (2 templates, not Fathom's full 16-template picklist — see
// research/fathom-teardown.md "What I'd build first") and action-item
// extraction. Both take the same transcript shape a real uploaded
// recording would produce, so this is exactly what runs against live
// (non-seed) meetings, not a seed-only code path.

const MODEL = "openai/gpt-oss-120b";

function client() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to .env to generate real summaries/action items."
    );
  }
  return new Groq({ apiKey });
}

export type TranscriptLineInput = { speakerName: string; text: string };

export type TranscribedSegment = { startMs: number; endMs: number; text: string };

// Real transcription (Groq-hosted Whisper) for uploaded recordings — the
// "upload a recording" flow that stands in for real Zoom/Meet/Teams bot
// capture (see research/fathom-teardown.md "What I'd build first", #7).
// Whisper doesn't do speaker diarization, so every segment is attributed to
// a single "Speaker" — a real, disclosed limitation, not spoken-for-them
// fabrication.
//
// Takes the already-compressed buffer (src/lib/audio.ts transcodes the
// original upload to a small mono/low-bitrate mp3 first) and uploads it
// directly to Groq — not by URL, since Groq's own 25MB file-size cap means
// we need to guarantee the *compressed* bytes are what gets sent, not have
// Groq fetch the original (potentially much larger) upload itself.
export async function transcribeAudio(
  buffer: Buffer,
  filename: string
): Promise<TranscribedSegment[]> {
  const groq = client();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const file = new File([arrayBuffer], filename, { type: "audio/mpeg" });

  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = (result as unknown as { segments?: { start: number; end: number; text: string }[] })
    .segments;
  if (!segments || segments.length === 0) {
    // Fall back to one segment covering the whole clip if the API doesn't
    // return per-segment timing for some reason.
    return [{ startMs: 0, endMs: 0, text: result.text.trim() }];
  }
  return segments.map((s) => ({
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
    text: s.text.trim(),
  }));
}

function transcriptToPlainText(lines: TranscriptLineInput[]) {
  return lines.map((l) => `${l.speakerName}: ${l.text}`).join("\n");
}

const TEMPLATE_PROMPTS: Record<"GENERAL" | "SALES", string> = {
  GENERAL: `You are Fathom's meeting-summary AI. Write a concise, well-structured markdown
summary of the meeting transcript below, covering: what was discussed, decisions made, and
any notable context. Use short headings and bullet points. Do not invent details that
aren't in the transcript. Do not include a title heading, start straight with content.`,
  SALES: `You are Fathom's sales-call summary AI, using a BANT-style framework. Analyze the
sales call transcript below and produce a markdown summary with these sections in order:
**Budget**, **Authority**, **Need**, **Timeline**, and a final **Recommended next step**.
If the transcript doesn't clearly cover one of those areas, say so briefly rather than
inventing information. Do not include a title heading, start straight with content.`,
};

export async function generateSummary(
  lines: TranscriptLineInput[],
  template: "GENERAL" | "SALES"
): Promise<string> {
  const groq = client();
  const transcript = transcriptToPlainText(lines);

  const completion = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: TEMPLATE_PROMPTS[template] },
      { role: "user", content: `Meeting transcript:\n\n${transcript}` },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Groq response contained no text content");
  return text.trim();
}

const SPEAKER_NAMES_TOOL = {
  type: "function" as const,
  function: {
    name: "record_speaker_names",
    description: "Records the real names of speakers that the transcript clearly identifies.",
    parameters: {
      type: "object",
      properties: {
        speakers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: 'The speaker label, e.g. "Speaker 2".' },
              name: { type: "string", description: "Their name as used in the meeting." },
              evidence: {
                type: "string",
                description: "The exchange that shows it, quoted briefly (who said what, then who answered).",
              },
            },
            required: ["label", "name", "evidence"],
          },
        },
      },
      required: ["speakers"],
    },
  },
};

// Speakers separated by voice come out as "Speaker 1", "Speaker 2"… This
// looks for names the conversation itself gives away. Returns only confident
// matches; everyone else keeps their label for the user to rename.
export async function suggestSpeakerNames(
  lines: TranscriptLineInput[],
  labels: string[]
): Promise<Record<string, string>> {
  const groq = client();
  // Names usually surface early (introductions, the first hand-offs); cap
  // the input so a long meeting stays well inside the free tier's limits.
  const transcript = transcriptToPlainText(lines).slice(0, 24_000);

  const completion = await groq.chat.completions.create({
    model: MODEL,
    // A reasoning model: its thinking counts against this cap, and a
    // tighter one truncated the answer before the tool call on long meetings.
    max_tokens: 6000,
    messages: [
      {
        role: "system",
        content:
          "You work out who is who in a meeting transcript. Speakers were separated by voice and " +
          `labelled ${labels.join(", ")}. Read the whole meeting and name every speaker the ` +
          "conversation identifies. The usual signs:\n" +
          "- They introduce themselves: \"I'm Priya\", \"this is Omar from mobile\".\n" +
          "- Someone hands over to them by name and that speaker is the one who answers: " +
          "\"Priya, do you want to start?\" followed by Speaker 3 saying \"Sure...\" means Speaker 3 is Priya.\n" +
          "- Someone introduces them (\"my colleague Chris from our solutions team\") and a new " +
          "voice then speaks as that person (\"I'll mostly be listening in\").\n" +
          "- They answer to their name: \"Sorry, Sam.\" followed by \"I'm used to it.\"\n" +
          "- Someone thanks or addresses them by name right after they spoke.\n" +
          "Check each name against the rest of the meeting; it should fit everything that speaker " +
          "says. Do not guess from topics or job titles alone, and leave out speakers the " +
          "conversation never identifies. Use each name at most once. Call record_speaker_names " +
          "with what you found (quote the evidence), or with an empty list.",
      },
      { role: "user", content: `Meeting transcript:\n\n${transcript}` },
    ],
    tools: [SPEAKER_NAMES_TOOL],
    tool_choice: "auto",
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") return {};
  const { speakers = [] } = JSON.parse(toolCall.function.arguments) as {
    speakers?: { label: string; name: string }[];
  };
  const names: Record<string, string> = {};
  const used = new Set<string>();
  for (const { label, name } of speakers) {
    const clean = name?.trim();
    if (!labels.includes(label) || !clean || clean.length > 40 || /^speaker\s*\d+$/i.test(clean)) continue;
    if (used.has(clean.toLowerCase())) continue;
    used.add(clean.toLowerCase());
    names[label] = clean;
  }
  return names;
}

export type GeneratedActionItem = { text: string; owner?: string; dueDate?: string; lineIndex?: number };

const ACTION_ITEMS_TOOL = {
  type: "function" as const,
  function: {
    name: "record_action_items",
    description: "Records the action items extracted from a meeting transcript.",
    parameters: {
      type: "object",
      properties: {
        actionItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "The action item itself, concise." },
              owner: {
                type: "string",
                description: "Name of the person responsible, if stated or clearly implied.",
              },
              dueDate: {
                type: "string",
                description: "ISO 8601 date if a due date/deadline was mentioned, else omit.",
              },
              lineIndex: {
                type: "integer",
                description:
                  "The [number] of the transcript line where this commitment was made.",
              },
            },
            required: ["text", "lineIndex"],
          },
        },
      },
      required: ["actionItems"],
    },
  },
};

export async function generateActionItems(
  lines: TranscriptLineInput[]
): Promise<GeneratedActionItem[]> {
  const groq = client();
  // Numbered so the model can say which line each commitment came from; the
  // route turns that into a timestamp for the meeting timeline.
  const transcript = lines.map((l, i) => `[${i}] ${l.speakerName}: ${l.text}`).join("\n");

  const completion = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You extract concrete action items (commitments, follow-ups, tasks) from meeting " +
          "transcripts. Only include real commitments actually made in the transcript — do " +
          "not invent tasks. Each transcript line starts with its [number]; give the number " +
          "of the line where each commitment was made. Call the record_action_items tool " +
          "with your findings — if the transcript genuinely contains no action items, call " +
          "it with an empty actionItems array rather than not calling it at all.",
      },
      { role: "user", content: `Meeting transcript:\n\n${transcript}` },
    ],
    tools: [ACTION_ITEMS_TOOL],
    // Not forced ("auto", not a required tool_choice): a transcript can
    // genuinely have zero action items, and some models refuse to call a
    // *required* tool with an empty result, which Groq then rejects as
    // "tool_choice is required, but model did not call a tool" — a real
    // 400 we hit in production on a short, action-item-free transcript.
    tool_choice: "auto",
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    // The model chose not to call the tool at all — treat that as "no
    // action items found" rather than an error.
    return [];
  }
  const args = JSON.parse(toolCall.function.arguments) as { actionItems: GeneratedActionItem[] };
  return args.actionItems ?? [];
}
