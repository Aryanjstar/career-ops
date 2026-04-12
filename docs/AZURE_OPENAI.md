# Azure OpenAI Provider

career-ops can use Azure OpenAI as an alternative AI provider for evaluation, resume tailoring, and interview prep generation.

## Setup

1. Create an Azure OpenAI resource at [portal.azure.com](https://portal.azure.com)
2. Deploy a model (GPT-4.1, GPT-4o, or GPT-4o-mini recommended)
3. Create a `.env` file in the project root:

```env
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_CHATGPT_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_CHATGPT_MODEL=gpt-4.1
AZURE_OPENAI_API_VERSION=2025-01-01-preview
```

## Usage

### Evaluate a Job Description

```bash
# From a file
node services/evaluate.mjs jds/example-jd.txt

# Inline text
node services/evaluate.mjs "Senior AI Engineer at Google..."
```

This generates:
- A structured evaluation report in `reports/`
- A tracker entry in `batch/tracker-additions/`

### Interview Prep

```bash
# Generate prep for all active interviews
node services/interview-prep.mjs all

# Generate prep for a specific company
node services/interview-prep.mjs company "Google" "Software Engineer"
```

### Resume Tailoring

The `tailorResume()` function in `services/lib/azure-openai.mjs` can be used programmatically to generate JD-specific resume variants.

## How It Works

The Azure OpenAI provider uses the same evaluation framework as the Claude Code modes (blocks A-F scoring), but runs through the Azure OpenAI API instead of requiring Claude Code CLI.

This means you can:
- Run evaluations without Claude Code installed
- Use Azure credits (Visual Studio Enterprise, MSDN, etc.)
- Integrate with CI/CD pipelines
- Run batch evaluations programmatically

## Supported Models

| Model | Best For | Cost |
|-------|----------|------|
| GPT-4.1 | Full evaluations, interview prep | Higher |
| GPT-4o | Good balance of quality and speed | Medium |
| GPT-4o-mini | Quick evaluations, batch processing | Lower |

## Limitations

- The Azure OpenAI provider does not replace Claude Code for interactive use (portal scanning, form filling, etc.)
- Playwright-based features (PDF generation, portal scanning) still require the main career-ops setup
- This is a complementary provider for programmatic evaluation workflows
