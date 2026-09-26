import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI with recommended header
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Universal Gemini AI Assistant Endpoint with App Brain & Function Calling
app.post('/api/ai/assistant', async (req, res) => {
  try {
    const { message, history = [], appContext = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const spreadRate = appContext.constants?.spreadRate || 350;
    const paintCostPerGal = appContext.constants?.paintCostPerGal || 65;
    const repairRate = appContext.constants?.repairRate || 75;

    if (ai) {
      try {
        const systemInstruction = `You are Flip, the official AI contractor brain and voice assistant for Krueger Painting OS, working directly with master painter Josh Krueger in West Bend, Wisconsin.
You have the intelligence and authority to answer any question, talk conversationally, AND put things where they go in the app by returning structured actions.

Current App State Context:
- Active Tab: ${appContext.currentTab || 'dash'}
- Total Customers: ${appContext.customerCount || 0}
- Customer Overview: ${JSON.stringify(appContext.customersSummary || []).slice(0, 1000)}
- Recent Notes: ${JSON.stringify(appContext.recentNotes || []).slice(0, 500)}
- Recent Expenses: ${JSON.stringify(appContext.recentExpenses || []).slice(0, 500)}
- Rate Standards: Spread Rate = ${spreadRate} sq ft/gal (2 full coats), Paint = $${paintCostPerGal}/gal, Repairs = $${repairRate}/hr.
- Location: ${appContext.weatherLocation || 'West Bend, WI'}

Instructions:
1. Speak in a confident, crisp, and direct contractor tone. Keep your text response concise (2-4 sentences) because it will be spoken aloud to Josh through speech synthesis. Do not use markdown like asterisks or bullet lists in the speech reply so it sounds natural.
2. If Josh's request involves recording data, estimating, logging, or navigating, you MUST append a JSON code block at the very end of your response with the actions to execute:

\`\`\`json
{
  "actions": [
    // One or more actions:
    // { "type": "create_customer_estimate", "customerName": "...", "jobTitle": "...", "rooms": [{"n": "Living Room 14x16", "r": 350, "og": "2", "prod": "Emerald", "sheen": "Satin", "color": "Repose Gray"}], "repairs": [{"d": "Patch drywall", "h": 2}], "prepScope": "...", "scope": "..." }
    // { "type": "add_note", "title": "...", "category": "Material Run"|"Crew Instruction"|"General Reminder"|"Job Site Idea", "body": "..." }
    // { "type": "add_shopping_items", "items": [{"name": "3M 1.5in blue tape", "qty": 4, "store": "Sherwin-Williams", "cat": "Sundry"}] }
    // { "type": "log_expense", "vendor": "Menards", "amount": 65.50, "category": "Materials", "note": "Roller sleeves" }
    // { "type": "log_mileage", "purpose": "Cedarburg estimate", "miles": 26, "startLoc": "Shop", "endLoc": "Cedarburg" }
    // { "type": "navigate", "target": "dash"|"sched"|"weather"|"notes"|"tools"|"email"|"calculator"|"tax_report"|"price_book"|"mileage"|"expenses"|"shopping"|"color_db"|"settings"|"cloud_sync" }
  ]
}
\`\`\`
If Josh is simply asking a question or chatting without creating or moving anything, reply conversationally without the actions JSON block or with "actions": [].`;

        const contents = [
          ...history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          })),
          { role: 'user', parts: [{ text: message }] },
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
            temperature: 0.6,
          },
        });

        const rawText = response.text || '';
        let spokenReply = rawText;
        let actions: any[] = [];

        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (Array.isArray(parsed.actions)) {
              actions = parsed.actions;
            }
            spokenReply = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
          } catch {
            // ignore parse failure
          }
        }

        // Clean speech text of any markdown asterisks
        spokenReply = spokenReply.replace(/[*#_`]/g, '').trim();

        return res.json({
          reply: spokenReply,
          actions,
        });
      } catch (geminiErr: any) {
        console.warn('Gemini Assistant call failed, falling back to smart engine:', geminiErr.message);
      }
    }

    // Smart Fallback Rule Engine
    const lower = message.toLowerCase();
    const actions: any[] = [];
    let reply = '';

    // Check for navigation commands
    if (lower.includes('weather') || lower.includes('radar') || lower.includes('forecast')) {
      actions.push({ type: 'navigate', target: 'weather' });
      reply = "Taking you right to the Weather Hub and live radar.";
    } else if (lower.includes('schedule') || lower.includes('calendar') || lower.includes('agenda')) {
      actions.push({ type: 'navigate', target: 'sched' });
      reply = "Opening your master calendar and scheduled jobs.";
    } else if (lower.includes('note') && !lower.includes('add note')) {
      actions.push({ type: 'navigate', target: 'notes' });
      reply = "Opening your Field Notes notebook.";
    } else if (lower.includes('calc') || lower.includes('calculator')) {
      actions.push({ type: 'navigate', target: 'calculator' });
      reply = "Opening the paint square footage and gallon calculator.";
    } else if (lower.includes('tax') || lower.includes('report')) {
      actions.push({ type: 'navigate', target: 'tax_report' });
      reply = "Opening your contractor tax deductions report.";
    }

    // Check for expense logging
    const expenseMatch = lower.match(/(?:log|add|spent)?\s*\$?(\d+(?:\.\d{2})?)\s*(?:at|for|from)\s*([a-z0-9\s]+)/i);
    if ((lower.includes('expense') || lower.includes('spent') || lower.includes('bought')) && expenseMatch) {
      const amount = parseFloat(expenseMatch[1]);
      const vendorRaw = expenseMatch[2].trim();
      const vendor = vendorRaw.charAt(0).toUpperCase() + vendorRaw.slice(1);
      actions.push({
        type: 'log_expense',
        vendor,
        amount,
        category: 'Materials',
        note: `Logged via Flip AI`,
      });
      reply = `Logged $${amount.toFixed(2)} expense at ${vendor} in your expense ledger.`;
    }

    // Check for mileage logging
    const mileageMatch = lower.match(/(\d+(?:\.\d+)?)\s*miles?\s*(?:to|for)?\s*([a-z0-9\s]*)/i);
    if ((lower.includes('mileage') || lower.includes('miles') || lower.includes('drove')) && mileageMatch) {
      const miles = parseFloat(mileageMatch[1]);
      const purpose = mileageMatch[2] ? mileageMatch[2].trim() : 'Job site drive';
      actions.push({
        type: 'log_mileage',
        miles,
        purpose,
        startLoc: 'Shop',
        endLoc: purpose,
      });
      reply = `Logged ${miles} miles for ${purpose} at the IRS 67 cents deduction rate.`;
    }

    // Check for shopping list items
    if (lower.includes('shopping') || lower.includes('buy') || lower.includes('pick up') || lower.includes('need tape')) {
      const itemName = message.replace(/(?:add to shopping list|add to shopping|buy|pick up|we need|need)/gi, '').trim();
      actions.push({
        type: 'add_shopping_items',
        items: [{ name: itemName || 'Paint sundries', qty: 1, store: 'Sherwin-Williams', cat: 'Sundry' }],
      });
      reply = `Added ${itemName || 'items'} to your contractor shopping list.`;
    }

    // Check for field note
    if (lower.includes('add note') || lower.includes('remember') || lower.includes('remind me')) {
      const noteBody = message.replace(/(?:add note|remember to|remind me to|create note)/gi, '').trim();
      actions.push({
        type: 'add_note',
        title: noteBody.slice(0, 30) || 'Job Site Reminder',
        category: 'General Reminder',
        body: noteBody,
      });
      reply = `Added that note to your Field Notes notebook.`;
    }

    // Check for estimate / room creation
    const dimRegex = /(?:(\w+)\s+)?(\d+)\s*(?:x|by|\*)\s*(\d+)/gi;
    const rooms: any[] = [];
    let dMatch: RegExpExecArray | null;
    while ((dMatch = dimRegex.exec(message)) !== null) {
      const roomLabel = dMatch[1] ? dMatch[1].charAt(0).toUpperCase() + dMatch[1].slice(1) : 'Room';
      const w = parseInt(dMatch[2], 10);
      const l = parseInt(dMatch[3], 10);
      const sqft = w * l;
      const gals = Math.max(1, Math.ceil((sqft * 2) / spreadRate));
      const labor = Math.round(sqft * 1.10);
      rooms.push({
        n: `${roomLabel} ${w}x${l}`,
        r: labor,
        og: String(gals),
        prod: lower.includes('duration') ? 'Duration' : lower.includes('superpaint') ? 'SuperPaint' : 'Emerald',
        sheen: lower.includes('eggshell') ? 'Eggshell' : lower.includes('semi') ? 'Semi-Gloss' : 'Satin',
        sp: true,
      });
    }

    if (rooms.length > 0) {
      const clientNameMatch = message.match(/(?:for|client|customer)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      const customerName = clientNameMatch ? clientNameMatch[1].trim() : 'New Estimate';
      actions.push({
        type: 'create_customer_estimate',
        customerName,
        jobTitle: `${rooms[0].n} Walkthrough`,
        rooms,
        repairs: [],
        prepScope: 'Standard surface prep, scrape loose paint and prime.',
        scope: '2 full coats premium latex finish.',
      });
      reply = `Created a new estimate for ${customerName} with ${rooms.length} room(s) and calculated paint gallons.`;
    }

    if (!reply) {
      if (lower.includes('primer') || lower.includes('water stain') || lower.includes('smoke')) {
        reply = "For water stains or tannin bleed, always use Zinsser B-I-N pigmented shellac or an oil-based primer. Water-based latex primers will reactivate the stain and bleed right through.";
      } else if (lower.includes('sheen') || lower.includes('finish')) {
        reply = "We recommend flat or matte for ceilings to hide drywall tape seams, satin or eggshell for living room walls for gentle washability, and semi-gloss for trim and doors for durable protection.";
      } else if (lower.includes('temperature') || lower.includes('cold') || lower.includes('weather')) {
        reply = "Sherwin-Williams Duration and SuperPaint can be applied down to 35 degrees Fahrenheit, but surface temperature must stay above freezing for at least 48 hours for a complete cure.";
      } else {
        reply = "I'm ready, Josh! You can ask me trade questions, tell me to calculate rooms, log expenses, add shopping items, or dictate notes, and I'll place them right where they go.";
      }
    }

    return res.json({ reply, actions });
  } catch (error: any) {
    console.error('Assistant error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Voice Estimator AI Assistant Endpoint
app.post('/api/ai/estimate-voice', async (req, res) => {
  try {
    const { message, history = [], currentJob = {}, constants = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const spreadRate = constants.spreadRate || 350;
    const paintCostPerGal = constants.paintCostPerGal || 65;
    const repairRate = constants.repairRate || 75;

    // If Gemini is available, use gemini-3.8-flash
    if (ai) {
      try {
        const systemPrompt = `You are Flip, the official voice estimating partner for Krueger Painting (West Bend, WI).
You are talking directly to Josh Krueger while he is walking through job sites with clients or speaking his job notes out loud.
Speak directly, concisely, and conversationally in a confident contractor tone because your response will be read aloud through speech synthesis.

Krueger Painting Standards:
- Standard application: 2 FULL COATS.
- Coverage rate: ${spreadRate} sq ft per gallon (1 gal per ${Math.round(spreadRate / 2)} sq ft for 2 full coats).
- Paint cost: $${paintCostPerGal} per gallon (Sherwin-Williams Emerald, SuperPaint, Duration).
- Standard labor: ~$1.00 - $1.25 per sq ft for walls.
- Surface repairs (drywall patching, scraping, priming, rotted wood): $${repairRate}/hr.

Current project context:
- Project Title: ${currentJob.title || 'New Estimate'}
- Existing Rooms: ${JSON.stringify(currentJob.rooms || [])}
- Existing Repairs: ${JSON.stringify(currentJob.repairs || [])}

When Josh speaks or dictates his notes (whether a quick question or a full job walkthrough):
1. Provide a concise, clear spoken answer summarizing what you heard and calculated (e.g. total square footage, paint gallons for 2 coats, labor total, repairs, and grand estimate).
2. At the very end of your response, ALWAYS include a JSON block with any structured items found:
\`\`\`json
{
  "parsedPrepScope": "Prep instructions extracted from notes (e.g. Pressure wash, scrape loose paint, prime bare wood)",
  "parsedScope": "General application scope (e.g. 2 full coats latex satin on walls, semi-gloss on trim)",
  "proposedRooms": [
    { "n": "Room Name with Dimensions", "r": 350, "og": "2", "prod": "Emerald", "sheen": "Satin", "color": "Repose Gray" }
  ],
  "proposedRepairs": [
    { "d": "Repair description", "h": 2 }
  ]
}
\`\`\`
If no specific items were mentioned for a field, leave it empty or empty array. Keep the spoken reply punchy and under 4-5 sentences so it speaks fast and clearly.`;

        const contents = [
          ...history.map((h: any) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          })),
          { role: 'user', parts: [{ text: message }] },
        ];

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          },
        });

        const rawText = response.text || '';

        // Extract JSON block if present
        let proposedRooms: any[] = [];
        let proposedRepairs: any[] = [];
        let parsedPrepScope = '';
        let parsedScope = '';
        let spokenReply = rawText;

        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (Array.isArray(parsed.proposedRooms)) proposedRooms = parsed.proposedRooms;
            if (Array.isArray(parsed.proposedRepairs)) proposedRepairs = parsed.proposedRepairs;
            if (parsed.parsedPrepScope) parsedPrepScope = String(parsed.parsedPrepScope).trim();
            if (parsed.parsedScope) parsedScope = String(parsed.parsedScope).trim();
            spokenReply = rawText.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
          } catch {
            // ignore parse error
          }
        }

        return res.json({
          reply: spokenReply,
          proposedRooms,
          proposedRepairs,
          parsedPrepScope,
          parsedScope,
        });
      } catch (aiErr: any) {
        console.warn('Gemini API call failed, falling back to smart rule engine:', aiErr.message);
      }
    }

    // Fallback Smart Estimator Rule Engine
    const lower = message.toLowerCase();
    let reply = '';
    const proposedRooms: any[] = [];
    const proposedRepairs: any[] = [];
    let parsedPrepScope = '';
    let parsedScope = '';

    // Extract prep scope
    if (lower.includes('pressure wash') || lower.includes('wash') || lower.includes('scrape') || lower.includes('sand') || lower.includes('caulk') || lower.includes('prime')) {
      parsedPrepScope = 'Pressure wash surfaces, scrape loose paint, sand edges, and apply exterior primer to bare wood.';
    }

    // Extract general scope
    if (lower.includes('coat') || lower.includes('satin') || lower.includes('flat') || lower.includes('semi-gloss') || lower.includes('emerald') || lower.includes('duration')) {
      parsedScope = 'Apply 2 full coats of premium latex coatings to specified walls and trim.';
    }

    // Match all dimension patterns (e.g. 14x16, 12 by 15, 10 * 12)
    const dimRegex = /(?:(\w+)\s+)?(\d+)\s*(?:x|by|\*)\s*(\d+)/gi;
    let match: RegExpExecArray | null;
    let totalLabor = 0;
    let totalGals = 0;

    while ((match = dimRegex.exec(message)) !== null) {
      const roomLabel = match[1] ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : 'Area';
      const w = parseInt(match[2], 10);
      const l = parseInt(match[3], 10);
      const sqft = w * l;
      const gals = Math.max(1, Math.ceil((sqft * 2) / spreadRate));
      const labor = Math.round(sqft * 1.05);

      totalLabor += labor;
      totalGals += gals;

      proposedRooms.push({
        n: `${roomLabel} ${w}x${l}`,
        r: labor,
        og: String(gals),
        prod: lower.includes('duration') ? 'Duration' : lower.includes('superpaint') ? 'SuperPaint' : 'Emerald',
        sheen: lower.includes('eggshell') ? 'Eggshell' : lower.includes('semi') ? 'Semi-Gloss' : 'Satin',
        sp: true,
      });
    }

    // Match repair hours
    const repMatch = lower.match(/(\d+)\s*(?:hours?|hrs?)\s*(?:of\s*)?(?:repair|patch|drywall|prep|carpentry)/) ||
                     lower.match(/(?:repair|patch|drywall)\s*(?:for\s*)?(\d+)\s*(?:hours?|hrs?)/);
    if (repMatch) {
      const hrs = parseInt(repMatch[1], 10);
      proposedRepairs.push({
        d: 'Surface prep, drywall patching & repairs',
        h: hrs,
      });
    } else if (lower.includes('prep') || lower.includes('repair') || lower.includes('patch')) {
      proposedRepairs.push({
        d: 'Surface prep, scraping and patching',
        h: 2,
      });
    }

    if (proposedRooms.length > 0 || proposedRepairs.length > 0) {
      const repTotal = proposedRepairs.reduce((acc, cur) => acc + cur.h * repairRate, 0);
      const grandTotal = totalLabor + repTotal + (totalGals * paintCostPerGal);
      reply = `Got your notes, Josh! I've calculated ${proposedRooms.length} room(s) ($${totalLabor} labor, ${totalGals} gals paint)${proposedRepairs.length > 0 ? ` and ${proposedRepairs.length} repair item(s)` : ''}, for a grand estimate of $${grandTotal}. Tap below to apply everything straight into your estimate.`;
    } else {
      reply = `I'm listening, Josh! Speak your room sizes (like 14 by 18 master bedroom), paint choices, or surface repairs, and I'll calculate labor and gallon totals for your quote.`;
    }

    return res.json({
      reply,
      proposedRooms,
      proposedRepairs,
      parsedPrepScope,
      parsedScope,
    });
  } catch (error: any) {
    console.error('Estimate voice error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Format Spoken Notes AI Endpoint
app.post('/api/ai/format-note', async (req, res) => {
  try {
    const { transcript, constants = {} } = req.body;
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const spreadRate = constants.spreadRate || 350;
    const repairRate = constants.repairRate || 75;

    if (ai) {
      try {
        const prompt = `You are Flip, the official AI assistant for Krueger Painting contractor Josh Krueger.
Take this raw spoken field note transcript and organize it into a structured, professional contractor note.
Also extract any job estimation items (rooms with width x length, repair hours, prep, paint colors/sheen).

Raw transcript:
"${transcript}"

Reply strictly in valid JSON matching this schema:
\`\`\`json
{
  "title": "Short descriptive subject (max 6 words)",
  "category": "Material Run" | "Crew Instruction" | "General Reminder" | "Job Site Idea",
  "formattedBody": "Bullet-pointed summary with clear headers (Scope, Surface Prep, Material Checklist, Crew Reminders, etc.)",
  "extractedJob": {
    "rooms": [
      { "n": "Room Name WxL", "r": 350, "og": "2", "prod": "Emerald", "sheen": "Satin", "color": "Color Name" }
    ],
    "repairs": [
      { "d": "Repair description", "h": 2 }
    ],
    "prepScope": "Prep instructions",
    "scope": "Overall painting scope"
  }
}
\`\`\``;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            temperature: 0.2,
          },
        });

        const text = response.text || '';
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          return res.json(parsed);
        }
      } catch (err: any) {
        console.warn('Gemini note formatting failed, falling back to rule engine:', err.message);
      }
    }

    // Fallback Rule Engine for note formatting
    const lower = transcript.toLowerCase();
    let category = 'General Reminder';
    if (lower.includes('buy') || lower.includes('store') || lower.includes('tape') || lower.includes('run') || lower.includes('sherwin')) {
      category = 'Material Run';
    } else if (lower.includes('crew') || lower.includes('tell') || lower.includes('make sure') || lower.includes('worker')) {
      category = 'Crew Instruction';
    } else if (lower.includes('idea') || lower.includes('quote') || lower.includes('customer') || lower.includes('homeowner')) {
      category = 'Job Site Idea';
    }

    const proposedRooms: any[] = [];
    const dimRegex = /(?:(\w+)\s+)?(\d+)\s*(?:x|by|\*)\s*(\d+)/gi;
    let dMatch: RegExpExecArray | null;
    while ((dMatch = dimRegex.exec(transcript)) !== null) {
      const roomLabel = dMatch[1] ? dMatch[1].charAt(0).toUpperCase() + dMatch[1].slice(1) : 'Room';
      const w = parseInt(dMatch[2], 10);
      const l = parseInt(dMatch[3], 10);
      const sqft = w * l;
      const gals = Math.max(1, Math.ceil((sqft * 2) / spreadRate));
      const labor = Math.round(sqft * 1.05);
      proposedRooms.push({
        n: `${roomLabel} ${w}x${l}`,
        r: labor,
        og: String(gals),
        prod: 'Emerald',
        sheen: 'Satin',
        sp: true,
      });
    }

    const proposedRepairs: any[] = [];
    const repMatch = lower.match(/(\d+)\s*(?:hours?|hrs?)/);
    if (repMatch) {
      proposedRepairs.push({
        d: 'Surface prep & drywall repair',
        h: parseInt(repMatch[1], 10),
      });
    }

    const formattedBody = `• Spoken Notes:\n${transcript}\n\n• Action Items:\n- Review measurements and material counts on-site\n- Verify finish sheens and surface repairs with client`;

    return res.json({
      title: proposedRooms.length > 0 ? `${proposedRooms[0].n} Walkthrough` : 'Job Site Notes',
      category,
      formattedBody,
      extractedJob: {
        rooms: proposedRooms,
        repairs: proposedRepairs,
        prepScope: lower.includes('scrape') || lower.includes('wash') ? 'Scrape loose coatings and prep surfaces.' : '',
        scope: '2 full coats premium latex coatings.',
      },
    });
  } catch (error: any) {
    console.error('Note format error:', error);
    res.status(500).json({ error: error.message || 'Failed to format note' });
  }
});

// Weather Radar Proxy or Status Endpoint
app.get('/api/radar-status', async (_req, res) => {
  try {
    const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!rvRes.ok) throw new Error('RainViewer API offline');
    const data = await rvRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Radar service currently unavailable' });
  }
});

// Full Project Codebase ZIP Export Endpoint
app.get('/api/export-project-zip', async (_req, res) => {
  try {
    const { exec } = await import('child_process');
    const zipPath = path.resolve('/tmp', 'krueger-painting-os.zip');
    const pyCommand = `python3 -c "import zipfile, os; exclude_dirs = {'node_modules', 'dist', 'dist-singlefile', '.git', '.cache'}; with zipfile.ZipFile('${zipPath}', 'w', zipfile.ZIP_DEFLATED) as zipf: [zipf.write(os.path.join(root, file), os.path.relpath(os.path.join(root, file), '.')) for root, dirs, files in os.walk('.') if not dirs.intersection_update([d for d in dirs if d not in exclude_dirs]) for file in files if not file.endswith('.pyc')]"`;

    exec(pyCommand, { cwd: path.resolve(__dirname) }, (err) => {
      if (err) {
        console.error('ZIP generation error:', err);
        return res.status(500).json({ error: 'Failed to generate codebase zip file' });
      }
      res.download(zipPath, 'krueger-painting-os.zip');
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Export failed' });
  }
});

// Direct Standalone Web View Route
app.get('/standalone', (_req, res) => {
  const standalonePath = path.resolve(__dirname, 'public', 'krueger-painting-standalone.html');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(standalonePath);
});

// Standalone 1-Click HTML File Export Endpoint (Single file, no folders, tap to run offline in Chrome)
app.get('/api/export-single-html', (_req, res) => {
  try {
    const standalonePath = path.resolve(__dirname, 'public', 'krueger-painting-standalone.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="krueger-painting-app.html"');
    res.sendFile(standalonePath);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Export failed' });
  }
});

// Setup Vite in Dev or Serve Static in Prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Krueger Painting OS running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
