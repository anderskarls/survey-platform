import { describe, it, expect } from "vitest";
import {
  compareTitles,
  isReleased,
  nextRelease,
  numberedReleaseDates,
  releasedWhere,
  titleWeekNumber,
  weeklyReleaseDates,
} from "./survey-release";
import { deriveTaskStatus, buildMomentState } from "./moment-status";

const NOW = new Date("2026-08-25T10:00:00Z");

describe("isReleased", () => {
  it("otidsatt enkät är alltid öppen", () => {
    expect(isReleased({ openAt: null }, NOW)).toBe(true);
  });

  it("släppt när tidpunkten passerats", () => {
    expect(isReleased({ openAt: new Date("2026-08-25T09:59:59Z") }, NOW)).toBe(
      true
    );
  });

  it("exakt på slaget räknas som släppt", () => {
    expect(isReleased({ openAt: new Date("2026-08-25T10:00:00Z") }, NOW)).toBe(
      true
    );
  });

  it("stängd före tidpunkten", () => {
    expect(isReleased({ openAt: new Date("2026-08-25T10:00:01Z") }, NOW)).toBe(
      false
    );
  });
});

describe("releasedWhere", () => {
  it("släpper igenom både otidsatt och passerat", () => {
    expect(releasedWhere(NOW)).toEqual({
      OR: [{ openAt: null }, { openAt: { lte: NOW } }],
    });
  });
});

describe("nextRelease", () => {
  it("plockar det närmaste kommande släppet, inte det första i listan", () => {
    const surveys = [
      { id: 1, openAt: new Date("2026-09-14T06:00:00Z") },
      { id: 2, openAt: null },
      { id: 3, openAt: new Date("2026-08-31T06:00:00Z") },
      { id: 4, openAt: new Date("2026-08-24T06:00:00Z") }, // redan släppt
    ];
    expect(nextRelease(surveys, NOW)?.id).toBe(3);
  });

  it("null när allt redan är öppet", () => {
    expect(
      nextRelease([{ id: 1, openAt: null }, { id: 2, openAt: new Date(0) }], NOW)
    ).toBeNull();
  });
});

describe("weeklyReleaseDates", () => {
  it("ett släpp i veckan från startpunkten", () => {
    const start = new Date(2026, 7, 31, 8, 0); // måndag 31 aug 2026, lokal tid
    const dates = weeklyReleaseDates(start, 3);
    expect(dates.map((d) => d.getDate())).toEqual([31, 7, 14]);
    expect(dates.every((d) => d.getDay() === start.getDay())).toBe(true);
  });

  it("behåller klockslaget över sommartidsomställningen", () => {
    // Sista söndagen i oktober 2026 ställs klockan tillbaka i Sverige. Ett
    // schema räknat i millisekunder hade flyttat släppet till 07:00 här.
    const start = new Date(2026, 9, 19, 8, 0); // måndag 19 okt
    const dates = weeklyReleaseDates(start, 3);
    expect(dates.map((d) => d.getHours())).toEqual([8, 8, 8]);
  });

  it("tom lista för noll enkäter", () => {
    expect(weeklyReleaseDates(new Date(2026, 7, 31, 8, 0), 0)).toEqual([]);
  });
});

describe("compareTitles", () => {
  it("sorterar veckotest numeriskt, inte alfabetiskt", () => {
    const titles = ["Veckotest 10", "Veckotest 2", "Veckotest 1"];
    expect([...titles].sort(compareTitles)).toEqual([
      "Veckotest 1",
      "Veckotest 2",
      "Veckotest 10",
    ]);
  });
});

describe("deriveTaskStatus med släppdatum", () => {
  it("osläppt enkät är kommande även när lektionsdatumet passerat", () => {
    expect(
      deriveTaskStatus({
        hasResponse: false,
        hasDraft: false,
        lessonDate: new Date(2026, 0, 1),
        released: false,
        today: new Date(2026, 7, 25),
      })
    ).toBe("upcoming");
  });

  it("redan inlämnat förblir klart om läraren skjuter fram släppet", () => {
    expect(
      deriveTaskStatus({ hasResponse: true, hasDraft: false, released: false })
    ).toBe("done");
  });

  it("utan flaggan beter sig allt som förut", () => {
    expect(
      deriveTaskStatus({
        hasResponse: false,
        hasDraft: false,
        lessonDate: null,
      })
    ).toBe("todo");
  });
});

describe("buildMomentState med släppdatum", () => {
  const today = new Date(2026, 7, 25, 10, 0);

  it("håller kommande veckotest utanför det eleven kan göra nu", () => {
    const state = buildMomentState({
      lessons: [],
      surveys: [
        { id: 1, title: "Veckotest 1", lesson: null, questionCount: 5, openAt: null },
        {
          id: 2,
          title: "Veckotest 2",
          lesson: null,
          questionCount: 5,
          openAt: new Date(2026, 8, 1, 8, 0),
        },
      ],
      submittedSurveyIds: [],
      draftSurveyIds: [],
      today,
    });
    expect(state.looseTasks.map((t) => t.status)).toEqual(["todo", "upcoming"]);
    expect(state.stats.todo).toBe(1);
    expect(state.stats.upcoming).toBe(1);
  });

  it("bär med släppdatumet så vyn kan skriva ut det", () => {
    const openAt = new Date(2026, 8, 1, 8, 0);
    const state = buildMomentState({
      lessons: [],
      surveys: [
        { id: 2, title: "Veckotest 2", lesson: null, questionCount: 5, openAt },
      ],
      submittedSurveyIds: [],
      draftSurveyIds: [],
      today,
    });
    expect(state.looseTasks[0].openAt).toEqual(openAt);
  });
});

describe("titleWeekNumber", () => {
  it("plockar numret ur titeln", () => {
    expect(titleWeekNumber("Veckotest 06")).toBe(6);
    expect(titleWeekNumber("Veckotest 33")).toBe(33);
  });

  it("null när titeln saknar siffror", () => {
    expect(titleWeekNumber("Diagnos")).toBeNull();
  });
});

describe("numberedReleaseDates", () => {
  const start = new Date(2026, 7, 31, 8, 0); // måndag 31 aug 2026

  it("lämnar tomma veckor där numret hoppar", () => {
    // Engelska 5:s upplägg: var femte nummer är en repetitionsvecka utan test.
    const dates = numberedReleaseDates(start, [
      "Veckotest 01",
      "Veckotest 02",
      "Veckotest 03",
      "Veckotest 04",
      "Veckotest 06",
    ]);
    expect(dates?.map((d) => d.getDate())).toEqual([31, 7, 14, 21, 5]);
    // Test 06 hamnar fem veckor efter test 01, inte fyra.
    expect(dates![4].getTime() - dates![0].getTime()).toBe(
      5 * 7 * 24 * 60 * 60 * 1000
    );
  });

  it("lägsta numret hamnar på startpunkten även när listan börjar högre", () => {
    const dates = numberedReleaseDates(start, ["Veckotest 11", "Veckotest 12"]);
    expect(dates?.[0]).toEqual(start);
  });

  it("null när en titel saknar nummer", () => {
    expect(numberedReleaseDates(start, ["Veckotest 01", "Diagnos"])).toBeNull();
  });

  it("null när två titlar delar nummer", () => {
    expect(
      numberedReleaseDates(start, ["Veckotest 01", "Prov 1"])
    ).toBeNull();
  });
});
