const prompt = `
    {
      "id": "4d5fee4d-2057-49b7-a292-592b90e837a2",
      "type": "user",
      "message": {
        "role": "user",
        "content": "<command-message>iterate_plan is running…</command-message>\\n<command-name>/iterate_plan</command-name>"
      },
      "timestamp": "2025-12-02T22:10:29.819Z"
    }
`;

// Simulate the content string extraction that happens before the component logic
// The component receives `request.message.content` which is the string inside "content"
const content = "<command-message>iterate_plan is running…</command-message>\n<command-name>/iterate_plan</command-name>";

const commandNameMatch = content.match(
    /<command-name>(.*?)<\/command-name>/
);

if (commandNameMatch && commandNameMatch[1]) {
    console.log("Extracted:", commandNameMatch[1]);
    if (commandNameMatch[1] === "/iterate_plan") {
        console.log("SUCCESS");
    } else {
        console.log("FAILURE");
    }
} else {
    console.log("No match found");
}
