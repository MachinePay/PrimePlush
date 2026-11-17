import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button, Card, EmptyState } from "../components/admin/ui";
import { IconLogout, IconShield } from "../components/admin/icons";

// Funcionário logado sem nenhuma aba liberada pelo admin master.
const AdminNoAccessPage: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="pp-animate-in mx-auto max-w-lg pt-10">
      <Card>
        <EmptyState
          icon={<IconShield />}
          title="Nenhuma aba liberada"
          description="Seu login ainda não tem acesso a nenhuma área do painel. Peça ao administrador para liberar as abas que você precisa."
          action={
            <Button
              variant="secondary"
              icon={<IconLogout />}
              onClick={async () => {
                await logout();
                navigate("/admin/login");
              }}
            >
              Sair
            </Button>
          }
        />
      </Card>
    </div>
  );
};

export default AdminNoAccessPage;
