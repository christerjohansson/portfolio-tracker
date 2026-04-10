import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function useAuth() {
  const {
    data,
    error,
    isLoading,
  } = useQuery<{user: User | null, setupRequired: boolean}>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) {
        const d = await res.json();
        return { user: null, setupRequired: !!d.setupRequired };
      }
      if (!res.ok) throw new Error("Fetch failed");
      return { user: await res.json(), setupRequired: false };
    },
    staleTime: Infinity,
    retry: false,
  });

  const user = data?.user || null;
  const setupRequired = data?.setupRequired || false;

  const setupMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/auth/setup", { password });
      return await res.json();
    },
    onSuccess: (newUser: User) => {
      queryClient.setQueryData(["/api/auth/me"], { user: newUser, setupRequired: false });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("POST", "/api/auth/login", {
        username: "admin",
        password,
      });
      return await res.json();
    },
    onSuccess: (newUser: User) => {
      queryClient.setQueryData(["/api/auth/me"], { user: newUser, setupRequired: false });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], { user: null, setupRequired: false });
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    setupRequired,
    setupMutation,
    loginMutation,
    logoutMutation,
  };
}
