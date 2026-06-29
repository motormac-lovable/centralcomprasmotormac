import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAILS = ["herllon.souza@motormac.com.br", "vanessa@motormac.com.br"];

/**
 * Exclusão completa de um usuário (auth + dados em cascata via FKs).
 * Apenas Proprietários ou Administradores podem chamar.
 * Proprietários NÃO podem ser excluídos.
 */
export const deleteUserCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica permissão do chamador (papel OU e-mail de Proprietário nativo)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const callerEmailIsOwner =
      !!callerProfile?.email && OWNER_EMAILS.includes(callerProfile.email.toLowerCase());
    const isOwner = callerEmailIsOwner || (roles ?? []).some((r: any) => r.role === "owner");
    const isAdmin = isOwner || (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });


    if (data.user_id === userId) {
      throw new Response("Você não pode excluir o próprio usuário.", { status: 400 });
    }

    // Bloqueia exclusão de Proprietário
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const targetIsOwner = (targetRoles ?? []).some((r: any) => r.role === "owner");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", data.user_id)
      .maybeSingle();
    const targetEmailIsOwner =
      !!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase());

    if (targetIsOwner || targetEmailIsOwner) {
      throw new Response("Proprietários não podem ser excluídos.", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

/**
 * Atualiza o papel (role) de um usuário registrado.
 * Proprietário pode atribuir qualquer papel.
 * Administrador pode atribuir apenas admin ou buyer.
 * Proprietários não podem ter seu papel alterado.
 */
export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["owner", "admin", "buyer", "solicitante", "aprovador"]),
    }).parse(data),
  )

  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const { data: callerAuth } = await supabaseAdmin.auth.admin.getUserById(userId);
    const callerEmail = callerAuth?.user?.email ?? callerProfile?.email ?? (claims as any)?.email ?? "";
    const callerEmailIsOwner =
      !!callerEmail && OWNER_EMAILS.includes(callerEmail.toLowerCase());
    const callerIsOwner = callerEmailIsOwner || (callerRoles ?? []).some((r: any) => r.role === "owner");
    const callerIsAdmin = callerIsOwner || (callerRoles ?? []).some((r: any) => r.role === "admin");
    if (!callerIsAdmin) throw new Response("Forbidden", { status: 403 });

    if (!callerIsOwner && data.role === "owner") {
      throw new Response("Apenas Proprietários podem atribuir o papel de Proprietário.", { status: 403 });
    }


    // Remove papéis anteriores para que o cadastro fique com exatamente o nível escolhido.
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .in("role", ["owner", "admin", "buyer", "solicitante", "aprovador"]);


    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });
