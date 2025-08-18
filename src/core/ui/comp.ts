import { Component } from "../comp";

export class UIComponent extends Component {
  private _state: Record<string, any> = {};
  private _styles: Record<string, any> = {};
  private _attributes: Record<string, any> = {};

  constructor() {
    super();
  }

  public get state(){return this._state}
  public get styles(){return this._styles}
  public get attributes(){return this._attributes}
}
