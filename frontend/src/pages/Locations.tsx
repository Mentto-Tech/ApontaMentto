import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { useLocations, useCreateLocation, useUpdateLocation, useDeleteLocation, type Location } from "@/lib/queries";
import "../styles/Locations.css";

const Locations = () => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const { data: locations = [] } = useLocations();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const deleteLocation = useDeleteLocation();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const openNew = () => {
    setEditing(null);
    setName("");
    setAddress("");
    setOpen(true);
  };

  const openEdit = (l: Location) => {
    setEditing(l);
    setName(l.name);
    setAddress(l.address);
    setOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (editing) {
      updateLocation.mutate(
        { id: editing.id, name: name.trim(), address: address.trim() },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createLocation.mutate(
        { name: name.trim(), address: address.trim() },
        { onSuccess: () => setOpen(false) }
      );
    }
  };

  const isPending = createLocation.isPending || updateLocation.isPending;

  return (
    <div className="page-locations max-w-2xl mx-auto px-4 py-6 md:py-10">
      <div className="locations-header flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Locais</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="bg-primary">
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Local" : "Novo Local"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Escritório Centro" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Endereço</label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Opcional" />
              </div>
              <Button onClick={handleSave} className="w-full bg-primary" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum local cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((l, i) => (
            <div
              key={l.id}
              className="locations-item flex items-center gap-3 bg-card border border-border rounded-lg p-3 animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{l.name}</div>
                {l.address && <div className="text-xs text-muted-foreground truncate">{l.address}</div>}
              </div>
              <div className="locations-item-actions flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(l)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteLocation.mutate(l.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Locations;
