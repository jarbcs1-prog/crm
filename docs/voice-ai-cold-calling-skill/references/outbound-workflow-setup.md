# Outbound Voice AI Workflow — Timezone-Aware Setup

## The Problem

GHL's time window setting is per-workflow, not per-contact. If your account is in one timezone and your contacts span the globe, a single fixed window will call some people at 2 AM.

## The Solution: Region-Based IF/ELSE Branches

### Step 1: Create Custom Field

In Menu → Settings → Custom Fields → Add dropdown field:
- **Name:** `Target Region`
- **Options:** US/Canada East, US/Canada West, UK/Europe, Australia East, New Zealand, UAE/Dubai, India, Nepal

### Step 2: Populate Before Import

When building contact lists, set the Target Region based on their location.

### Step 3: Workflow Settings

| Setting | Value |
|---------|-------|
| Allow re-entry | OFF |
| Allow multiple opportunities | ON |
| Stop on response | ON |
| Timezone | Account timezone (NPT) |
| Time window | OFF (branches handle timing individually) |
| From name | Our name |
| From email | hello@ourname.com |
| From number | A2P-approved number |
| Mark as read | OFF |

### Step 4: Workflow Prompt for GHL AI Builder

```
Build an outbound voice AI calling workflow for Ourname.com. Trigger is manual against a contact list.

FIRST: Check contact's "Target Region" custom field and route.

IF Target Region = "US/Canada East":
  Wait until contact's local time is 9AM-6PM Eastern before calling.

IF Target Region = "US/Canada West":
  Wait until contact's local time is 9AM-6PM Pacific before calling.

IF Target Region = "UK/Europe":
  Wait until contact's local time is 9AM-6PM GMT before calling.

IF Target Region = "Australia East":
  Wait until contact's local time is 9AM-6PM AEDT before calling.

IF Target Region = "New Zealand":
  Wait until contact's local time is 9AM-6PM NZDT before calling.

IF Target Region = "UAE/Dubai":
  Wait until contact's local time is 9AM-6PM Gulf Standard Time before calling.

IF Target Region = "India":
  Wait until contact's local time is 10AM-7PM IST before calling.

IF Target Region = "Nepal":
  Wait until contact's local time is 10AM-6PM NPT before calling.

THE CALL: Voice AI calls using Ourname Sales Agent. Opening: "Hi, I'm [Agent Name] with Ourname. Bit of a random call — doing research with businesses about their online presence and phone calls. Two minutes?"

If no answer: Wait 2 hours, SMS "Hey [first name], tried to catch you. With Ourname — help businesses look great online and never miss a lead. Got 2 minutes? Reply YES or STOP."

If they say no: Tag "Not Interested", wait 24hrs, SMS "No worries. Know any other owners who might find this useful?"

If interested: Tag "Hot Lead", create callback task within 24hrs, SMS "Great talking. Team member will reach out within 24 hours for free audit."

If callback requested: Tag "Callback Scheduled", create task with date and time.

If they have existing solution: Tag "Has Existing Solution", wait 90 days, SMS "Hey, how's your online presence working? Still happy? If anything changed, we're here."

Update pipeline stage based on outcome.
```

## Inbound vs Outbound

| | Inbound Agent | Outbound Workflow |
|---|---|---|
| Answers 24/7/365? | YES | NO — business hours only |
| Time window needed? | No | Yes (per region) |
| Who controls timing? | Caller | Workflow branches |
