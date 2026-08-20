import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Login from "./Login";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    isAdmin: false,
    login: mocks.login,
    logout: vi.fn(),
    signup: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("seu@email.com"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("••••••"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /entrar/i }));
}

describe("Login", () => {
  it("envia email sem espaços e navega em caso de sucesso", async () => {
    mocks.login.mockResolvedValueOnce(true);
    render(<Login />);

    fillForm("  user@mentto.com.br  ", "senha12345");

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith("user@mentto.com.br", "senha12345")
    );
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/"));
  });

  it("limpa o campo de senha após falha para evitar acúmulo", async () => {
    mocks.login.mockResolvedValueOnce(false);
    render(<Login />);

    const passwordInput = screen.getByPlaceholderText("••••••");
    fillForm("user@mentto.com.br", "senha12345");

    await waitFor(() => expect(mocks.login).toHaveBeenCalled());
    await waitFor(() => expect((passwordInput as HTMLInputElement).value).toBe(""));

    expect(mocks.toastError).toHaveBeenCalledWith("Email ou senha incorretos.");
  });

  it("usa o valor real do DOM no submit (autofill não dispara onChange)", async () => {
    mocks.login.mockResolvedValueOnce(false);
    render(<Login />);

    // Simula autofill do navegador no load: grava direto no DOM, sem disparar
    // onChange do React e sem re-render entre o preenchimento e o submit.
    (screen.getByPlaceholderText("seu@email.com") as HTMLInputElement).value = "user@mentto.com.br";
    (screen.getByPlaceholderText("••••••") as HTMLInputElement).value = "autofilled-senha";

    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith("user@mentto.com.br", "autofilled-senha")
    );
  });

  it("registra auditoria no console ao enviar", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.login.mockResolvedValueOnce(false);
    render(<Login />);

    fillForm("user@mentto.com.br", "senha12345");

    await waitFor(() => expect(mocks.login).toHaveBeenCalled());
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining("password_len=10")
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("senha será limpo"));

    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });
});