export async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body,
  });

  if (!response.ok) {
    throw new Error("The artwork could not be uploaded to private storage. Please try again.");
  }
}
