const express = require("express");
const app = express();
app.use(express.json());
app.use(express.static("public"));

const MAX_TASKS = 75;
const ACTIVE_TASKS = 6;

let teams = [];
let nextTeamId = 1;
let contestStartTime = null;

// =======================
// Tworzenie drużyny
// =======================
function createTeam(name, startTask) {
    let tasks = Array(MAX_TASKS).fill("grey");
    let taskStartTimes = Array(MAX_TASKS).fill(null);

    for (let i = 0; i < ACTIVE_TASKS; i++) {
        let idx = startTask - 1 + i;
        if (idx < MAX_TASKS) {
            tasks[idx] = "empty";
            taskStartTimes[idx] = null; // ustawimy po starcie zawodów
        }
    }

    return {
        id: nextTeamId++,
        name,
        startTask,
        tasks,
        taskStartTimes,
        solves: [] // { task, time (ms od przydzielenia) }
    };
}

// =======================
// Dodanie drużyny
// =======================
app.post("/add-team", (req, res) => {
    if (teams.length >= 9)
        return res.json({ error: "Max 9 drużyn" });

    const { name, startTask } = req.body;

    const team = createTeam(name, startTask);
    teams.push(team);

    res.json({ success: `Dodano drużynę nr ${team.id}` });
});

// =======================
// Start zawodów
// =======================
app.post("/start-contest", (req, res) => {
    if (contestStartTime !== null)
        return res.json({ error: "Zawody już rozpoczęte" });

    contestStartTime = Date.now();

    // ustaw czas przydzielenia dla początkowych zadań
    teams.forEach(team => {
        team.tasks.forEach((status, i) => {
            if (status === "empty") {
                team.taskStartTimes[i] = contestStartTime;
            }
        });
    });

    res.json({ success: "Zawody rozpoczęte" });
});

// =======================
// Pobranie drużyn (ranking live)
// =======================
app.get("/teams", (req, res) => {

    const ranking = teams.map(team => ({
        id: team.id,
        name: team.name,
        tasks: team.tasks,
        solved: team.solves.length
    }));

    res.json(ranking);
});

// =======================
// Skanowanie zadania
// =======================
app.post("/scan", (req, res) => {

    if (!contestStartTime)
        return res.json({ error: "Zawody jeszcze się nie rozpoczęły" });

    const { code } = req.body;

    if (!code || code.length !== 4)
        return res.json({ error: "Kod musi mieć 4 cyfry" });

    const teamNumber = parseInt(code[0]);
    const taskNumber = parseInt(code.slice(1));

    const team = teams.find(t => t.id === teamNumber);
    if (!team)
        return res.json({ error: "Nie istnieje drużyna o tym numerze" });

    const idx = taskNumber - 1;

    if (idx < 0 || idx >= MAX_TASKS)
        return res.json({ error: "Nieprawidłowy numer zadania" });

    if (team.tasks[idx] === "full")
        return res.json({ error: "Drużyna już zrobiła to zadanie" });

    if (team.tasks[idx] !== "empty")
        return res.json({ error: "Drużyna nie powinna mieć tego zadania" });

    // oblicz czas rozwiązania (od przydzielenia)
    const solveTime = Date.now() - team.taskStartTimes[idx];

    team.tasks[idx] = "full";
    team.solves.push({
        task: taskNumber,
        time: solveTime
    });

    // =======================
    // Przydzielenie następnego zadania
    // =======================
    const highestGivenIndex = team.tasks
        .map((status, i) => status !== "grey" ? i : -1)
        .filter(i => i !== -1)
        .reduce((a, b) => Math.max(a, b), -1);

    const nextIndex = highestGivenIndex + 1;

    if (nextIndex < MAX_TASKS) {
        team.tasks[nextIndex] = "empty";
        team.taskStartTimes[nextIndex] = Date.now();
    }

    res.json({ success: `Drużyna ${team.name} rozwiązała zadanie ${taskNumber}` });
});

// =======================
// PODSUMOWANIE
// =======================
app.get("/summary", (req, res) => {

    const teamSummary = teams.map(team => {

        let avgTime = 0;
        let highestTask = 0;
        let lastSubmissionTime = 0;

        if (team.solves.length > 0) {

            // średni czas od przydzielenia
            const total = team.solves.reduce((a, s) => a + s.time, 0);
            avgTime = total / team.solves.length;

            // najwyższe zadanie
            highestTask = Math.max(...team.solves.map(s => s.task));

            // czas oddania ostatniego zadania od startu konkursu
            const lastSolve = team.solves[team.solves.length - 1];
            const solveTimestamp =
                team.taskStartTimes[lastSolve.task - 1] + lastSolve.time;

            lastSubmissionTime = solveTimestamp - contestStartTime;
        }

        return {
            name: team.name,
            solved: team.solves.length,
            avgSeconds: Math.round(avgTime / 1000),
            highestTask,
            lastSubmissionSeconds: Math.round(lastSubmissionTime / 1000)
        };
    });

    // =======================
    // SORTOWANIE JAK NABOJ
    // =======================
    const sortedTeams = [...teamSummary].sort((a, b) => {

        if (b.solved !== a.solved)
            return b.solved - a.solved;

        if (b.highestTask !== a.highestTask)
            return b.highestTask - a.highestTask;

        return a.lastSubmissionSeconds - b.lastSubmissionSeconds;
    });

    // =======================
    // STATYSTYKI ZADAŃ
    // =======================
    const taskStats = [];

    for (let i = 0; i < MAX_TASKS; i++) {

        const solvedTeams = teams.filter(team =>
            team.solves.some(s => s.task === i + 1)
        );

        let avgTime = 0;

        if (solvedTeams.length > 0) {
            const total = solvedTeams.reduce((sum, team) => {
                const s = team.solves.find(s => s.task === i + 1);
                return sum + s.time;
            }, 0);

            avgTime = total / solvedTeams.length / 1000;
        }

        taskStats.push({
            task: i + 1,
            solvedBy: solvedTeams.length,
            avgSeconds: Math.round(avgTime)
        });
    }

    res.json({
        teams: sortedTeams,
        tasks: taskStats
    });
});

app.listen(3000, () =>
    console.log("Serwer działa na http://localhost:3000")
);