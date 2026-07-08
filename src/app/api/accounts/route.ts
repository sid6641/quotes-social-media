import { NextRequest, NextResponse } from "next/server";
import {
  createAccount,
  getAccount,
  getAllAccounts,
  updateAccount,
  deleteAccount,
  getAccountsSummary,
  invalidateAccountsCache,
} from "@/lib/account";

/**
 * GET /api/accounts — list all accounts.
 * GET /api/accounts?id=xxx — get single account.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const account = getAccount(id);
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, account });
  }

  const accounts = getAllAccounts();
  return NextResponse.json({ success: true, accounts });
}

/**
 * POST /api/accounts — create or update an account.
 * Body includes all AccountConfig fields.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Update existing
    const existing = getAccount(id);
    if (existing) {
      const updated = updateAccount(id, body);
      invalidateAccountsCache();
      return NextResponse.json({ success: true, account: updated });
    }

    // Create new
    const account = createAccount({
      id,
      name: body.name || id,
      description: body.description,
      scope: body.scope,
      schedule: body.schedule,
      instagram: body.instagram,
      cooldownDays: body.cooldownDays ?? 30,
      templates: body.templates,
      promptTemplate: body.promptTemplate,
      enabled: body.enabled ?? true,
    });

    invalidateAccountsCache();
    return NextResponse.json({ success: true, account });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}

/**
 * DELETE /api/accounts — delete an account.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    const deleted = deleteAccount(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    invalidateAccountsCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
