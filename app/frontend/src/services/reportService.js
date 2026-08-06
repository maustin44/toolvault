export async function getLatestReport() {
    const res = await fetch("/api/report/latest");
    
    if (!res.ok) {
        throw new Error("Failed to fetch report");
    }

    return res.json();
}
