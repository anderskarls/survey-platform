import { describe, expect, it } from "vitest";
import {
  AdminScope,
  courseScopeWhere,
  fullScope,
  ownCoursesWhere,
  questionScopeWhere,
  scopeAllowsCourse,
  scopeIsOwner,
} from "./authz";

const agare: AdminScope = fullScope(1, "Anders");
const apiNyckel: AdminScope = fullScope(null, "API-nyckel");
const larare: AdminScope = {
  adminId: 2,
  name: "Kollega",
  email: "kollega@example.invalid",
  isOwner: false,
  courseIds: [13],
};
const utanKurser: AdminScope = {
  adminId: 3,
  name: "Ny kollega",
  email: "ny@example.invalid",
  isOwner: false,
  courseIds: [],
};

describe("scopeAllowsCourse", () => {
  it("släpper igenom ägaren och API-nyckeln till vilken kurs som helst", () => {
    expect(scopeAllowsCourse(agare, 13)).toBe(true);
    expect(scopeAllowsCourse(agare, 999)).toBe(true);
    expect(scopeAllowsCourse(apiNyckel, 999)).toBe(true);
  });

  it("släpper igenom läraren till sin egen kurs", () => {
    expect(scopeAllowsCourse(larare, 13)).toBe(true);
  });

  it("stoppar läraren vid alla andra kurser", () => {
    expect(scopeAllowsCourse(larare, 12)).toBe(false);
    expect(scopeAllowsCourse(larare, 1)).toBe(false);
  });

  it("stoppar en lärare utan tilldelade kurser", () => {
    expect(scopeAllowsCourse(utanKurser, 13)).toBe(false);
  });

  it("stoppar skräpvärden i stället för att tolka dem", () => {
    // Number("abc") ger NaN, och NaN får aldrig råka passera ett filter.
    expect(scopeAllowsCourse(larare, NaN)).toBe(false);
    expect(scopeAllowsCourse(larare, 13.5)).toBe(false);
  });
});

describe("courseScopeWhere", () => {
  it("lämnar ägaren ofiltrerad", () => {
    expect(courseScopeWhere(agare)).toEqual({});
  });

  it("begränsar läraren till sina kurser", () => {
    expect(courseScopeWhere(larare)).toEqual({ courseId: { in: [13] } });
  });

  it("ger noll träffar för en lärare utan kurser i stället för alla", () => {
    // Det här är hela poängen med att skilja på null och tom lista: en tom
    // lista måste bli ett filter som matchar ingenting, inte ett tomt filter
    // som matchar allt.
    expect(courseScopeWhere(utanKurser)).toEqual({ courseId: { in: [] } });
  });
});

describe("questionScopeWhere", () => {
  it("lämnar ägaren ofiltrerad", () => {
    expect(questionScopeWhere(agare)).toEqual({});
  });

  it("når kursen via ämnet, eftersom frågan saknar egen courseId", () => {
    expect(questionScopeWhere(larare)).toEqual({
      topic: { courseId: { in: [13] } },
    });
  });

  it("ger noll träffar för en lärare utan kurser", () => {
    expect(questionScopeWhere(utanKurser)).toEqual({
      topic: { courseId: { in: [] } },
    });
  });
});

describe("ownCoursesWhere", () => {
  it("filtrerar på id, inte courseId, eftersom det gäller Course självt", () => {
    expect(ownCoursesWhere(larare)).toEqual({ id: { in: [13] } });
    expect(ownCoursesWhere(agare)).toEqual({});
  });
});

describe("scopeIsOwner", () => {
  it("skiljer ägare från lärare", () => {
    expect(scopeIsOwner(agare)).toBe(true);
    expect(scopeIsOwner(apiNyckel)).toBe(true);
    expect(scopeIsOwner(larare)).toBe(false);
    expect(scopeIsOwner(utanKurser)).toBe(false);
  });
});
