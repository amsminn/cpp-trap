export const SITE_NAME = "C++ Trap";
export const SITE_ALTERNATE_NAMES = ["C++ 트랩", "cpp-trap"] as const;
export const HOME_TITLE = "C++ Trap · Tiny C++ puzzles about the language's traps";
export const HOME_LEAD = "Fill the code slot within the limits to complete each problem's stated goal.";
export const HOME_LEAD_KO = "C++ 트랩은 코드 한 칸을 제한 안에서 채워 각 문제의 목표를 달성하는 C++ 함정 퍼즐 모음입니다.";
export const ABOUT_INTRO = "C++ Trap is a set of tiny problems about the surprising corners of C++. Each problem gives you a program with one code slot.";
export const ABOUT_CREDITS = "The problems were created by Mawekl for Security Traps (securitytraps.pl), which went offline in 2021. This site republishes them so they are not lost, with credit on every problem.";

export function pageTitle(page: string): string {
  return `${page} · ${SITE_NAME}`;
}
