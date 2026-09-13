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
// Transcribes by URL (Groq fetches the audio itself, server-to-server)
// rather than by uploading bytes through our own function — the file
// already lives in Vercel Blob storage by the time this runs (see
// src/app/api/blob/upload-url/route.ts), specifically so we never need to
// route large audio through a Vercel Serverless Function's ~4.5MB request
// body cap.
export async function transcribeAudio(url: string): Promise<TranscribedSegment[]> {
  const groq = client();

  const result = await groq.audio.transcriptions.create({
    url,
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

export type GeneratedActionItem = { text: string; owner?: string; dueDate?: string };

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
            },
            required: ["text"],
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
  const transcript = transcriptToPlainText(lines);

  const completion = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You extract concrete action items (commitments, follow-ups, tasks) from meeting " +
          "transcripts. Only include real commitments actually made in the transcript — do " +
          "not invent tasks. Call the record_action_items tool exactly once with your findings.",
      },
      { role: "user", content: `Meeting transcript:\n\n${transcript}` },
    ],
    tools: [ACTION_ITEMS_TOOL],
    tool_choice: { type: "function", function: { name: "record_action_items" } },
  });

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Groq response contained no tool call");
  }
  const args = JSON.parse(toolCall.function.arguments) as { actionItems: GeneratedActionItem[] };
  return args.actionItems;
}
