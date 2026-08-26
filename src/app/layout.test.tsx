import Link from "next/link";
import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it } from "vitest";

import RootLayout, { metadata } from "@/app/layout";
import { SiteFooter } from "@/components/SiteFooter";

type ElementProps = {
  children?: ReactNode;
  className?: string;
  href?: unknown;
};

type TestElement = ReactElement<ElementProps>;

function directChildren(node: ReactNode): TestElement[] {
  const elements: TestElement[] = [];

  Children.forEach(node, (child) => {
    if (isValidElement<ElementProps>(child)) {
      elements.push(child);
    }
  });

  return elements;
}

function descendants(element: TestElement): TestElement[] {
  return directChildren(element.props.children).flatMap((child) => [
    child,
    ...descendants(child),
  ]);
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (!isValidElement<ElementProps>(node)) {
    return Children.toArray(node).map(textContent).join("");
  }

  return textContent(node.props.children);
}

function classTokens(element: TestElement): string[] {
  return element.props.className?.split(/\s+/).filter(Boolean) ?? [];
}

function renderLayout() {
  const content = createElement("main", { "data-testid": "page-content" });
  const root = RootLayout({ children: content });

  if (!isValidElement<ElementProps>(root)) {
    throw new Error("Expected RootLayout to return a React element.");
  }

  return { content, root };
}

describe("RootLayout structure", () => {
  it("uses the production You Kno Ball domain for metadata URLs", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://youknoball.com/");
  });

  it("preserves the brand and responsive primary navigation", () => {
    const { root } = renderLayout();
    const body = directChildren(root.props.children).find(
      (element) => element.type === "body",
    );
    const header = body && descendants(body).find(
      (element) => element.type === "header",
    );

    expect(header).toBeDefined();

    const headerElements = descendants(header as TestElement);
    const links = headerElements.filter((element) => element.type === Link);
    const hrefs = links.map((element) => element.props.href);
    const headerText = textContent(header);

    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/play");
    expect(hrefs).toContain("/leaderboard");
    expect(hrefs).toContain("/groups");
    expect(hrefs).toContain("/categories");
    expect(hrefs).not.toContain("/categories/nba");
    expect(headerText).toContain("You Kno Ball");
    expect(headerText).toContain("Daily sports trivia");
    expect(headerText).toContain("Categories");
    expect(headerText).toContain("Board");
    expect(headerText).not.toContain("NBA");

    const logo = links.find((element) => element.props.href === "/");
    const logoTokens = logo ? classTokens(logo) : [];
    expect(logoTokens).toEqual(
      expect.arrayContaining([
        "rounded-2xl",
        "px-3",
        "py-2",
        "hover:ring-[#ff7a18]/70",
        "active:scale-[0.98]",
        "active:bg-[#ff7a18]/10",
        "focus-visible:ring-[#ff7a18]/70",
      ]),
    );

    const brandRow = headerElements.find((element) =>
      directChildren(element.props.children).includes(logo as TestElement),
    );
    expect(brandRow && classTokens(brandRow)).toEqual(
      expect.arrayContaining(["gap-10", "lg:gap-12"]),
    );

    const brand = headerElements.find(
      (element) => textContent(element) === "You Kno Ball",
    );
    expect(brand && classTokens(brand)).toEqual(
      expect.arrayContaining([
        "text-xl",
        "tracking-[0.08em]",
        "text-[#ff7a18]",
      ]),
    );

    const subtitle = headerElements.find(
      (element) => textContent(element) === "Daily sports trivia",
    );
    const subtitleTokens = subtitle ? classTokens(subtitle) : [];
    expect(subtitleTokens).toEqual(
      expect.arrayContaining([
        "text-sm",
        "tracking-[0.08em]",
        "sm:text-lg",
      ]),
    );
    expect(subtitleTokens).not.toContain("sm:text-[0.65rem]");
    expect(subtitleTokens).not.toContain("sm:tracking-[0.5em]");

    const mobileNavigation = headerElements.find((element) => {
      const tokens = classTokens(element);
      return tokens.includes("justify-between") && tokens.includes("text-[0.68rem]");
    });
    expect(mobileNavigation && classTokens(mobileNavigation)).toEqual(
      expect.arrayContaining([
        "gap-2",
        "tracking-[0.08em]",
        "sm:gap-4",
        "sm:text-xs",
        "sm:tracking-[0.3em]",
      ]),
    );
  });

  it("keeps page content growing and renders the footer after it", () => {
    const { content, root } = renderLayout();
    const body = directChildren(root.props.children).find(
      (element) => element.type === "body",
    );

    expect(body).toBeDefined();
    expect(body && classTokens(body)).toEqual(
      expect.arrayContaining(["flex", "min-h-screen", "flex-col"]),
    );

    const bodyChildren = directChildren(body?.props.children);
    const contentWrapperIndex = bodyChildren.findIndex(
      (element) => element.props.children === content,
    );
    const footerIndex = bodyChildren.findIndex(
      (element) => element.type === SiteFooter,
    );
    const contentWrapper = bodyChildren[contentWrapperIndex];

    expect(contentWrapperIndex).toBeGreaterThanOrEqual(0);
    expect(contentWrapper && classTokens(contentWrapper)).toEqual(
      expect.arrayContaining(["relative", "flex-1"]),
    );
    expect(footerIndex).toBeGreaterThan(contentWrapperIndex);
  });
});
